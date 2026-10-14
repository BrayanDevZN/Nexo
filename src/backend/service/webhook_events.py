import ipaddress
import json
import logging
import socket
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse
from uuid import uuid4

import httpx
from fastapi.encoders import jsonable_encoder

logger = logging.getLogger(__name__)

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
        for raw_id in ids:
            identifier = raw_id.decode() if isinstance(raw_id, bytes) else str(raw_id)
            raw = self.redis.get(f"{self.prefix}:subscription:{identifier}")
            if not raw:
                continue
            record = json.loads(raw)
            payload = jsonable_encoder({"event": event, "data": data})
            self.executor.submit(self._deliver, record["url"], payload)

    @staticmethod
    def _deliver(url: str, payload: dict) -> None:
        try:
            with httpx.Client(timeout=10, follow_redirects=False) as client:
                response = client.post(url, json=payload)
                response.raise_for_status()
        except Exception:
            logger.warning("Webhook event delivery failed for %s", url, exc_info=True)

    def close(self) -> None:
        self.executor.shutdown(wait=False, cancel_futures=True)
