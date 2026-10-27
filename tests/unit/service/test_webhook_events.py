import json
from datetime import UTC, datetime
from decimal import Decimal

import httpx

from backend.service.webhook_events import WebhookEventService


class RedisWithSubscription:
    def smembers(self, key):
        return {b"subscription-1"} if key.endswith(":event:newClient") else set()

    def get(self, key):
        return json.dumps({
            "id": "subscription-1",
            "event": "newClient",
            "url": "https://n8n.example/webhook/nexo-event",
        })


class InlineExecutor:
    def submit(self, callback, *args):
        callback(*args)

    def shutdown(self, **_kwargs):
        pass


def test_client_event_with_datetime_and_decimal_reaches_webhook(monkeypatch):
    received = []
    real_client = httpx.Client

    def handle(request):
        received.append(json.loads(request.content))
        assert request.headers["X-Nexo-Event"] == "newClient"
        assert request.headers["X-Nexo-Delivery"]
        return httpx.Response(200)

    transport = httpx.MockTransport(handle)
    monkeypatch.setattr(
        "backend.service.webhook_events.httpx.Client",
        lambda **kwargs: real_client(transport=transport, **kwargs),
    )
    service = WebhookEventService(RedisWithSubscription(), "test")
    service.executor.shutdown(wait=False, cancel_futures=True)
    service.executor = InlineExecutor()
    service.emit("newClient", {
        "id": "client-1",
        "created_at": datetime(2026, 10, 14, 19, 0, tzinfo=UTC),
        "contract_value": Decimal("120.50"),
    })
    assert received == [{
        "event": "newClient",
        "data": {
            "id": "client-1",
            "created_at": "2026-10-14T19:00:00+00:00",
            "contract_value": 120.5,
        },
    }]


def test_subscription_lookup_checks_owner_and_missing_record():
    class Redis:
        def get(self, key):
            if key.endswith(":subscription-missing"):
                return None
            return json.dumps({
                "id": "subscription-1", "owner_id": "owner-1",
                "event": "newClient", "url": "https://n8n.example/webhook-test/nexo-event",
            })

    service = WebhookEventService(Redis(), "test")
    try:
        assert service.get_subscription("owner-1", "subscription-1")["event"] == "newClient"
        assert service.get_subscription("other-owner", "subscription-1") is None
        assert service.get_subscription("owner-1", "subscription-missing") is None
    finally:
        service.close()


def test_delivery_retries_transient_n8n_failure(monkeypatch):
    attempts = []
    real_client = httpx.Client

    def handle(request):
        attempts.append(request)
        return httpx.Response(503 if len(attempts) < 3 else 200)

    monkeypatch.setattr("backend.service.webhook_events.time.sleep", lambda _delay: None)
    monkeypatch.setattr(
        "backend.service.webhook_events.httpx.Client",
        lambda **kwargs: real_client(transport=httpx.MockTransport(handle), **kwargs),
    )
    WebhookEventService._deliver(
        "https://n8n.example/webhook-test/nexo-event",
        {"event": "newClient", "data": {"id": "client-1"}},
    )
    assert len(attempts) == 3
    assert len({request.headers["X-Nexo-Delivery"] for request in attempts}) == 1


class RedisWithTwoSubscriptionsToOneUrl:
    def smembers(self, key):
        return {b"old", b"new"} if key.endswith(":event:newClient") else set()

    def get(self, key):
        return json.dumps({"id": key.rsplit(":", 1)[-1], "event": "newClient", "url": "https://n8n.example/webhook/nexo-event"})


REAL_CLIENT = httpx.Client


def _service(redis, monkeypatch, handle):
    real_client = REAL_CLIENT
    monkeypatch.setattr("backend.service.webhook_events.httpx.Client",
                        lambda **kwargs: real_client(transport=httpx.MockTransport(handle), **kwargs))
    monkeypatch.setattr("backend.service.webhook_events.time.sleep", lambda _seconds: None)
    service = WebhookEventService(redis, "test")
    service.executor.shutdown(wait=False, cancel_futures=True)
    service.executor = InlineExecutor()
    return service


def test_two_subscriptions_to_the_same_url_deliver_the_event_once(monkeypatch):
    received = []
    service = _service(RedisWithTwoSubscriptionsToOneUrl(), monkeypatch, lambda request: received.append(1) or httpx.Response(200))
    service.emit("newClient", {"id": "client-1"})
    assert len(received) == 1


def test_a_slow_or_failing_workflow_is_not_called_again(monkeypatch):
    calls = []

    def slow(request):
        calls.append(1)
        raise httpx.ReadTimeout("slow", request=request)

    _service(RedisWithSubscription(), monkeypatch, slow).emit("newClient", {"id": "client-1"})
    assert len(calls) == 1
    calls.clear()
    _service(RedisWithSubscription(), monkeypatch, lambda request: calls.append(1) or httpx.Response(500)).emit("newClient", {"id": "client-1"})
    assert len(calls) == 1
    calls.clear()
    _service(RedisWithSubscription(), monkeypatch, lambda request: calls.append(1) or httpx.Response(503)).emit("newClient", {"id": "client-1"})
    assert len(calls) == 3


def test_subscribing_twice_to_the_same_url_reuses_the_subscription(monkeypatch):
    store = {}

    class Redis:
        def smembers(self, key):
            return {item.encode() for item in store.get(key, set())}

        def get(self, key):
            return store.get(key)

        def set(self, key, value):
            store[key] = value

        def sadd(self, key, value):
            store.setdefault(key, set()).add(value)

        def pipeline(self, transaction=True):
            redis = self

            class Pipe:
                def set(self, *a): redis.set(*a)
                def sadd(self, *a): redis.sadd(*a)
                def execute(self): pass
            return Pipe()

    service = WebhookEventService(Redis(), "test")
    monkeypatch.setattr(service, "_validate_url", lambda url: url)
    try:
        first = service.subscribe("owner-1", "newClient", "https://n8n.example/webhook/x")
        assert service.subscribe("owner-1", "newClient", "https://n8n.example/webhook/x")["id"] == first["id"]
        assert service.subscribe("owner-1", "any", "https://n8n.example/webhook/x")["id"] != first["id"]
    finally:
        service.close()
