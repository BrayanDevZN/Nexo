import json
import logging
from hashlib import sha256

from pywebpush import WebPushException, webpush

logger = logging.getLogger(__name__)


class PushService:
    prefix = "nexo:push:"

    def __init__(self, redis, settings):
        self.redis, self.settings = redis, settings

    @property
    def enabled(self):
        return bool(self.settings.vapid_subject and self.settings.vapid_public_key and self.settings.vapid_private_key)

    @staticmethod
    def key(user_id: str, endpoint: str) -> str:
        return f"{PushService.prefix}{user_id}:{sha256(endpoint.encode()).hexdigest()}"

    def subscribe(self, user_id: str, subscription: dict) -> None:
        self.redis.set(self.key(user_id, subscription["endpoint"]), json.dumps(subscription))

    def unsubscribe(self, user_id: str, endpoint: str) -> None:
        self.redis.delete(self.key(user_id, endpoint))

    def notify_users(self, user_ids, title: str, body: str, url: str = "/admin") -> None:
        if not self.enabled:
            return
        payload = json.dumps({"title": title, "body": body, "url": url})
        for user_id in set(user_ids):
            for key in self.redis.scan_iter(match=f"{self.prefix}{user_id}:*"):
                raw = self.redis.get(key)
                if not raw:
                    continue
                try:
                    webpush(subscription_info=json.loads(raw), data=payload,
                             vapid_private_key=self.settings.vapid_private_key.get_secret_value(),
                             vapid_claims={"sub": self.settings.vapid_subject})
                except WebPushException as exc:
                    status = getattr(getattr(exc, "response", None), "status_code", None)
                    if status in {404, 410}:
                        self.redis.delete(key)
                    else:
                        logger.warning("Web Push delivery failed", exc_info=True)
                except Exception:
                    logger.warning("Web Push delivery failed", exc_info=True)
