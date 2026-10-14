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
