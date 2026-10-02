from contextlib import ExitStack

from backend.infra.config.settings import Settings
from backend.infra.connections.database import DatabaseConnection
from backend.infra.connections.email import GmailConnection
from backend.infra.connections.redis import RedisConnection
from backend.repository.db.control.manager import RepositoryManager


class RuntimeServices:
    def __init__(self, settings: Settings):
        self._cleanup = ExitStack()
        try:
            self.database = DatabaseConnection(settings)
            self._cleanup.callback(self.database.close)
            self.repositories = RepositoryManager(self.database)
            self.redis = RedisConnection(settings)
            self._cleanup.callback(self.redis.close)
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
