import hashlib
import secrets
from datetime import UTC, date, datetime
from concurrent.futures import ThreadPoolExecutor

from backend.repository.db.models import ApiKey
from backend.service.access import ResourceNotFound, authorize


class ApiKeyAuthenticationError(ValueError):
    pass


class ApiKeyService:
    prefix = "nexo_live_"

    def __init__(self, repositories):
        self.repositories = repositories
        self._usage_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="api-key-usage")

    @staticmethod
    def _hash(value: str) -> str:
        return hashlib.sha256(value.encode("utf-8")).hexdigest()

    @staticmethod
    def _output(key: ApiKey) -> dict:
        return {
            "id": key.id, "name": key.name, "key_prefix": key.key_prefix,
            "created_at": key.created_at, "last_used_at": key.last_used_at,
        }

    def create(self, actor, name: str) -> tuple[dict, str]:
        with self.repositories.transaction() as repos:
            current = authorize(repos, actor, approved=True)
            raw = self.prefix + secrets.token_urlsafe(32)
            key = repos.api_keys.create(user_id=current.id, name=name,
                                        key_prefix=raw[:len(self.prefix) + 8], key_hash=self._hash(raw))
            return self._output(key), raw

    def list(self, actor):
        with self.repositories.read_transaction() as repos:
            current = authorize(repos, actor, approved=True)
            return [self._output(key) for key in repos.api_keys.list_for_user(current.id)]

    def revoke(self, actor, identifier: str) -> None:
        with self.repositories.transaction() as repos:
            current = authorize(repos, actor, approved=True)
            if not repos.api_keys.revoke(current.id, identifier, datetime.now(UTC).replace(tzinfo=None)):
                raise ResourceNotFound("API key not found")

    def authenticate(self, raw: str):
        if not raw or len(raw) > 160 or not raw.startswith(self.prefix):
            raise ApiKeyAuthenticationError("Invalid API key")
        with self.repositories.transaction() as repos:
            key = repos.api_keys.active_by_hash(self._hash(raw))
            if key is None:
                raise ApiKeyAuthenticationError("Invalid API key")
            user = repos.users.for_auth(key.user_id)
            if user is None or user.status != "approved":
                raise ApiKeyAuthenticationError("Invalid API key")
            key_id = key.id
        self._usage_executor.submit(self._record_access, key_id)
        return user

    def _record_access(self, key_id: str) -> None:
        try:
            used_at = datetime.now(UTC).replace(tzinfo=None)
            with self.repositories.transaction() as repos:
                repos.api_keys.touch_by_id(key_id, used_at)
                repos.api_keys.record_usage(key_id, used_at.date())
        except Exception:
            # Usage metrics must never break a valid API request.
            pass

    def close(self) -> None:
        self._usage_executor.shutdown(wait=False, cancel_futures=True)

    def usage(self, actor, days: int):
        with self.repositories.read_transaction() as repos:
            current = authorize(repos, actor, approved=True)
            return repos.api_keys.usage_for_user(current.id, days)
