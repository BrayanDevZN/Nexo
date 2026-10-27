import ipaddress
import json
import logging
import socket
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse
from uuid import uuid4

import httpx
from fastapi.encoders import jsonable_encoder

logger = logging.getLogger(__name__)

# Only failures where the workflow certainly did not run are retried; a timeout or a 500 may have run it already,
# and retrying would send the same message twice.
RETRY_STATUSES = {429, 502, 503, 504}

SUPPORTED_EVENTS = {
    "any",
    "teamAnnouncement",
    "newClient",
    "newAutomation",
    "closedContract",
    "memberJoined",
    "chatMessage",
    "automation",
}


class WebhookEventService:
    """Durable Redis-backed subscriptions used by external trigger nodes."""

    def __init__(self, redis_client, namespace: str):
        self.redis = redis_client
        self.prefix = namespace + ":webhooks"
        self.executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="nexo-webhooks")

    @staticmethod
    def _validate_url(url: str) -> str:
        parsed = urlparse(url)
        if parsed.scheme != "https" or not parsed.hostname:
            raise ValueError("Webhook URL must use HTTPS")
        # Do not turn the Nexo backend into an SSRF vending machine.
        try:
            addresses = socket.getaddrinfo(parsed.hostname, parsed.port or 443, type=socket.SOCK_STREAM)
        except socket.gaierror as exc:
            raise ValueError("Webhook hostname could not be resolved") from exc
        for address in addresses:
            ip = ipaddress.ip_address(address[4][0])
            if not ip.is_global:
                raise ValueError("Webhook URL must resolve to a public address")
        return url

    def subscribe(self, owner_id: str, event: str, url: str) -> dict:
        if event not in SUPPORTED_EVENTS:
            raise ValueError("Unsupported event")
        url = self._validate_url(url)
        # The same workflow asking twice (reactivated, or an old subscription it failed to remove) must not
        # make every event arrive twice, so an identical subscription is reused.
        for raw_id in self.redis.smembers(f"{self.prefix}:owner:{owner_id}"):
            existing = self.redis.get(f"{self.prefix}:subscription:{raw_id.decode() if isinstance(raw_id, bytes) else raw_id}")
            if existing:
                found = json.loads(existing)
                if found.get("event") == event and found.get("url") == url:
                    return found
        identifier = str(uuid4())
        record = {"id": identifier, "owner_id": owner_id, "event": event, "url": url}
        pipe = self.redis.pipeline(transaction=True)
        pipe.set(f"{self.prefix}:subscription:{identifier}", json.dumps(record))
        pipe.sadd(f"{self.prefix}:event:{event}", identifier)
        pipe.sadd(f"{self.prefix}:owner:{owner_id}", identifier)
        pipe.execute()
        return record

    def get_subscription(self, owner_id: str, identifier: str) -> dict | None:
        raw = self.redis.get(f"{self.prefix}:subscription:{identifier}")
        if not raw:
            return None
        record = json.loads(raw)
        return record if record.get("owner_id") == owner_id else None

    def unsubscribe(self, owner_id: str, identifier: str) -> bool:
        key = f"{self.prefix}:subscription:{identifier}"
        raw = self.redis.get(key)
        if not raw:
            return False
        record = json.loads(raw)
        if record.get("owner_id") != owner_id:
            return False
        pipe = self.redis.pipeline(transaction=True)
        pipe.delete(key)
        pipe.srem(f"{self.prefix}:event:{record['event']}", identifier)
        pipe.srem(f"{self.prefix}:owner:{owner_id}", identifier)
        pipe.execute()
        return True

    def emit(self, event: str, data) -> None:
        if event not in SUPPORTED_EVENTS - {"any"}:
            raise ValueError("Unsupported event")
        ids = set(self.redis.smembers(f"{self.prefix}:event:{event}"))
        ids.update(self.redis.smembers(f"{self.prefix}:event:any"))
        payload = jsonable_encoder({"event": event, "data": data})
        delivered = set()
        for raw_id in ids:
            identifier = raw_id.decode() if isinstance(raw_id, bytes) else str(raw_id)
            raw = self.redis.get(f"{self.prefix}:subscription:{identifier}")
            if not raw:
                continue
            record = json.loads(raw)
            # One delivery per address: two subscriptions to the same URL would run the workflow twice.
            if record["url"] in delivered:
                continue
            delivered.add(record["url"])
            self.executor.submit(self._deliver, record["url"], payload)

    @staticmethod
    def _deliver(url: str, payload: dict) -> None:
        delivery_id = str(uuid4())
        headers = {
            "X-Nexo-Delivery": delivery_id,
            "X-Nexo-Event": str(payload.get("event", "")),
        }
        last_error = None
        for attempt, delay in enumerate((0, 0.5, 2), start=1):
            if delay:
                time.sleep(delay)
            try:
                with httpx.Client(timeout=10, follow_redirects=False) as client:
                    response = client.post(url, json=payload, headers=headers)
                    if response.status_code in RETRY_STATUSES:
                        response.raise_for_status()
                    elif response.is_error:
                        logger.error("Webhook rejected: id=%s event=%s status=%s", delivery_id, payload.get("event"), response.status_code)
                        return
                logger.info(
                    "Webhook event delivered: id=%s event=%s status=%s attempt=%s",
                    delivery_id, payload.get("event"), response.status_code, attempt,
                )
                return
            except (httpx.ConnectError, httpx.ConnectTimeout, httpx.HTTPStatusError) as exc:
                last_error = exc
                logger.warning(
                    "Webhook delivery attempt failed: id=%s event=%s attempt=%s url=%s",
                    delivery_id, payload.get("event"), attempt, url, exc_info=True,
                )
            except Exception:
                # E.g. a read timeout: the workflow may have run, so it is not sent again.
                logger.error("Webhook delivery not confirmed, not retried: id=%s event=%s url=%s", delivery_id, payload.get("event"), url, exc_info=True)
                return
        logger.error(
            "Webhook event delivery exhausted retries: id=%s event=%s url=%s error=%r",
            delivery_id, payload.get("event"), url, last_error,
        )

    def close(self) -> None:
        self.executor.shutdown(wait=False, cancel_futures=True)
