from contextlib import contextmanager

from sqlalchemy import event

from backend.infra.connections.database import DatabaseConnection
from backend.repository.db.control.api_keys import ApiKeyRepository
from backend.repository.db.control.automation_requests import AutomationRequestRepository
from backend.repository.db.control.automations import AutomationRepository
from backend.repository.db.control.chat import ChatRepository
from backend.repository.db.control.clients import ClientRepository
from backend.repository.db.control.documents import DocumentRepository
from backend.repository.db.control.maps_credentials import MapsCredentialRepository
from backend.repository.db.control.maps_jobs import MapsJobRepository
from backend.repository.db.control.notifications import NotificationRepository
from backend.repository.db.control.paid_leads import PaidLeadRepository
from backend.repository.db.control.users import UserRepository


class Repositories:
    def __init__(self, session, principal_email=None):
        self.users = UserRepository(session, principal_email=principal_email)
        self.api_keys = ApiKeyRepository(session)
        self.automation_requests = AutomationRequestRepository(session)
        self.automations = AutomationRepository(session)
        self.clients = ClientRepository(session)
        self.documents = DocumentRepository(session)
        self.chat_messages = ChatRepository(session)
        self.notifications = NotificationRepository(session)
        self.maps_credentials = MapsCredentialRepository(session)
        self.maps_jobs = MapsJobRepository(session)
        self.paid_leads = PaidLeadRepository(session)


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
                if table in {"users", "api_keys", "automation_requests", "automations", "clients", "notifications", "documents", "chat_messages", "paid_leads"}:
                    changed.add(table)
            session.info["cache_dirty_tables"] = changed
        with self.database.session() as session:
            session.info["cache_dirty_tables"] = changed
            event.listen(session, "before_flush", track_changes)
            yield Repositories(session, self.principal_email)
        if self.cache is not None:
            invalidations = set(changed)
            # The overview is a cross-table projection.  Its cache must be
            # invalidated together with any table it summarizes.
            if changed & {"users", "clients", "notifications", "documents", "automations"}:
                invalidations.add("dashboard")
            self.cache.invalidate(invalidations)  # reached only after successful SQL commit
        if changed and self.on_change:
            self.on_change(changed)

    @contextmanager
    def read_transaction(self):
        """Yield repositories for a read path without committing a SQLite transaction."""
        with self.database.read_session() as session:
            yield Repositories(session, self.principal_email)
