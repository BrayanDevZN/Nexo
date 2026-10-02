import hashlib
from contextlib import ExitStack

from backend.domain.csrf import CSRFService
from backend.domain.passwords import PasswordHasher
from backend.domain.tokens import JWTService
from backend.infra.config.settings import Settings
from backend.infra.connections.database import DatabaseConnection
from backend.infra.connections.email import GmailConnection
from backend.infra.connections.redis import RedisConnection
from backend.repository.cache.aside import CacheAside
from backend.repository.cache.manager import CachedRepositoryManager
from backend.repository.db.control.manager import RepositoryManager
from backend.service.auth import AuthService
from backend.service.security import SessionSecurity


class RuntimeServices:
    def __init__(self, settings: Settings):
        self._cleanup = ExitStack()
        try:
            self.database = DatabaseConnection(settings)
            self._cleanup.callback(self.database.close)
            self.redis = RedisConnection(settings)
            self._cleanup.callback(self.redis.close)
            database_namespace = hashlib.sha256(settings.database_url.encode()).hexdigest()[:16]
            self.cache = CacheAside(self.redis.client, ttl=settings.cache_ttl_seconds,
                                    prefix="nexo:cache:" + database_namespace)
            self.repositories = RepositoryManager(self.database, cache=self.cache)
            self.cached_repositories = CachedRepositoryManager(self.repositories, self.cache)
            self.passwords = PasswordHasher()
            self.tokens = JWTService(settings.jwt_secret_key.get_secret_value(),
                                     expire_minutes=settings.jwt_expire_minutes)
            self.sessions = SessionSecurity(self.tokens, self.repositories)
            self.csrf = CSRFService(settings.jwt_secret_key.get_secret_value())
            self.auth = AuthService(self.repositories, self.passwords, self.sessions)
            self.email = GmailConnection(settings)
            self._cleanup.callback(self.email.close)
        except BaseException:
            self._cleanup.close()
            raise

    def readiness(self) -> dict[str, bool]:
        status = {}
        for name, connection in [("database", self.database), ("redis", self.redis)]:
            try:
                status[name] = connection.ping()
            except Exception:
                status[name] = False
        return status

    def close(self) -> None:
        self._cleanup.close()
