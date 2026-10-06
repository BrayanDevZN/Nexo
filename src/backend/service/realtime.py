import logging
import time
from types import SimpleNamespace

from backend.repository.redis.rate_limits import RateBudget
from backend.service.access import authorize
from backend.service.security import AuthenticationError

logger = logging.getLogger(__name__)


class RealtimeService:
    def __init__(self, events, repositories, settings, rate_limits):
        self.events, self.repositories = events, repositories
        self.settings, self.rate_limits = settings, rate_limits

    def changed(self, tables):
        try:
            if "notifications" in tables:
                self.events.publish({"type": "notifications.changed"})
            if "users" in tables:
                self.events.publish({"type": "account.changed"})
        except Exception:
            logger.warning("Realtime event unavailable; database change committed")

    def authenticate(self, payload):
        if not payload or payload["expires_at"] <= time.time():
            raise AuthenticationError("Expired realtime session")
        with self.repositories.transaction() as repos:
            return authorize(repos, SimpleNamespace(id=payload["id"], session_version=payload["session_version"]))

    def check_rate(self, user_id):
        budgets = self.rate_limits.budgets(user_id, "WS", "/realtime")
        budgets.append(RateBudget(self.events.prefix + ":messages:" + user_id,
                                  self.settings.ws_message_limit, 60))
        return self.rate_limits.repository.check(budgets)
