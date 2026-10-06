from contextlib import contextmanager

from sqlalchemy import event

from backend.infra.connections.database import DatabaseConnection
from backend.repository.db.control.chat import ChatRepository
from backend.repository.db.control.clients import ClientRepository
from backend.repository.db.control.documents import DocumentRepository
from backend.repository.db.control.notifications import NotificationRepository
from backend.repository.db.control.users import UserRepository


class Repositories:
    def __init__(self, session, principal_email=None):
        self.users = UserRepository(session, principal_email=principal_email)
        self.clients = ClientRepository(session)
        self.documents = DocumentRepository(session)
        self.chat_messages = ChatRepository(session)
        self.notifications = NotificationRepository(session)


class RepositoryManager:
    def __init__(self, database: DatabaseConnection, cache=None, principal_email=None, on_change=None):
        self.on_change = on_change
        self.database, self.cache = database, cache
        self.principal_email = principal_email

    @contextmanager
    def transaction(self):
        """All repositories share one session and one commit/rollback boundary."""
        changed = set()
        def track_changes(session, _context, _instances):
            for row in set(session.new) | set(session.dirty) | set(session.deleted):
                table = getattr(row, "__tablename__", None)
                if table in {"users", "clients", "notifications", "documents", "chat_messages"}:
                    changed.add(table)
            session.info["cache_dirty_tables"] = changed
        with self.database.session() as session:
            session.info["cache_dirty_tables"] = changed
            event.listen(session, "before_flush", track_changes)
            yield Repositories(session, self.principal_email)
        if self.cache is not None:
            self.cache.invalidate(changed)  # reached only after successful SQL commit
        if changed and self.on_change:
            self.on_change(changed)
