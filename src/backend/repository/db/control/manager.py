from contextlib import contextmanager

from sqlalchemy import event

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
    def __init__(self, database: DatabaseConnection, cache=None):
        self.database, self.cache = database, cache

    @contextmanager
    def transaction(self):
        """All repositories share one session and one commit/rollback boundary."""
        changed = set()
        def track_changes(session, _context, _instances):
            for row in set(session.new) | set(session.dirty) | set(session.deleted):
                table = getattr(row, "__tablename__", None)
                if table in {"users", "clients", "notifications"}:
                    changed.add(table)
            session.info["cache_dirty_tables"] = changed
        with self.database.session() as session:
            session.info["cache_dirty_tables"] = changed
            event.listen(session, "before_flush", track_changes)
            yield Repositories(session)
        if self.cache is not None:
            self.cache.invalidate(changed)  # reached only after successful SQL commit
