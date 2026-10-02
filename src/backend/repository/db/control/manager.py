from contextlib import contextmanager

from backend.infra.connections.database import DatabaseConnection
from backend.repository.db.control.clients import ClientRepository
from backend.repository.db.control.notifications import NotificationRepository
from backend.repository.db.control.users import UserRepository


class Repositories:
    def __init__(self, session):
        self.users = UserRepository(session)
        self.clients = ClientRepository(session)
        self.notifications = NotificationRepository(session)


class RepositoryManager:
    def __init__(self, database: DatabaseConnection):
        self.database = database

    @contextmanager
    def transaction(self):
        """All repositories share one session and one commit/rollback boundary."""
        with self.database.session() as session:
            yield Repositories(session)
