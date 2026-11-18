from contextlib import contextmanager

from sqlalchemy import event

from backend.infra.connections.database import DatabaseConnection
from backend.repository.db.models import Base
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
from backend.repository.db.control.scheduling import (
    BUSINESS_SCOPED_TABLES,
    SCHEDULING_TABLES,
    AppointmentRepository,
    BookingAccessLinkRepository,
    BookingUserRepository,
    BusinessRepository,
    BusinessServiceRepository,
)
from backend.repository.db.control.users import UserRepository
from backend.repository.db.control.video_jobs import VideoJobRepository

CACHED_TABLES = frozenset({"users", "api_keys", "automation_requests", "automations", "clients", "notifications",
                           "documents", "chat_messages", "paid_leads", *SCHEDULING_TABLES})


def _dependents() -> dict[str, set[str]]:
    """For each table, every table that keeps rows pointing at it (foreign keys, followed all the way down).

    Deleting or updating a row can delete, null out or restate rows in those tables (ON DELETE CASCADE / SET NULL, names
    and photos shown in lists), so their cached answers are dropped with it."""
    direct: dict[str, set[str]] = {}
    for table in Base.metadata.sorted_tables:
        for foreign_key in table.foreign_keys:
            direct.setdefault(foreign_key.column.table.name, set()).add(table.name)
    closure: dict[str, set[str]] = {}
    for table in direct:
        seen, pending = set(), list(direct[table])
        while pending:
            current = pending.pop()
            if current not in seen and current != table:
                seen.add(current)
                pending.extend(direct.get(current, ()))
        closure[table] = seen
    return closure


DEPENDENTS = _dependents()


class Repositories:
    def __init__(self, session, principal_email=None):
        self.users = UserRepository(session, principal_email=principal_email)
        self.booking_users = BookingUserRepository(session)
        self.booking_access_links = BookingAccessLinkRepository(session)
        self.businesses = BusinessRepository(session)
        self.business_services = BusinessServiceRepository(session)
        self.appointments = AppointmentRepository(session)
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
        self.video_jobs = VideoJobRepository(session)


class RepositoryManager:
    def __init__(self, database: DatabaseConnection, cache=None, principal_email=None, on_change=None):
        self.on_change = on_change
        self.database, self.cache = database, cache
        self.principal_email = principal_email

    @contextmanager
    def transaction(self):
        """All repositories share one session and one commit/rollback boundary."""
        changed, everywhere = set(), set()

        def mark(table, row=None, cascade=False):
            """Drop the cached answers of a table, and of the tables that depend on it when something is deleted or updated."""
            for name in ({table} | (DEPENDENTS.get(table, set()) if cascade else set())):
                if name not in CACHED_TABLES:
                    continue
                changed.add(name)
                # Scheduling data is cached per business, so one business's change leaves the others' cache alive.
                if name in BUSINESS_SCOPED_TABLES:
                    business_id = getattr(row, "business_id", None) if name == table else (getattr(row, "id", None) if table == "businesses" else None)
                    if business_id:
                        changed.add(name + ":" + business_id)
                    else:
                        everywhere.add(name)   # a change that does not say which business: every business's cache goes

        def track_changes(session, _context, _instances):
            for rows, cascade in ((session.new, False), (session.dirty, True), (session.deleted, True)):
                for row in set(rows):
                    mark(getattr(row, "__tablename__", None), row, cascade)
            session.info["cache_dirty_tables"] = changed

        def track_statements(state):
            """UPDATE and DELETE written as statements (not as changes to loaded rows) never reach before_flush."""
            if not (state.is_update or state.is_delete):
                return
            table = getattr(getattr(state.statement, "table", None), "name", None)
            if table:
                mark(table, None, True)
                state.session.info["cache_dirty_tables"] = changed
        with self.database.session() as session:
            session.info["cache_dirty_tables"] = changed
            event.listen(session, "before_flush", track_changes)
            event.listen(session, "do_orm_execute", track_statements)
            yield Repositories(session, self.principal_email)
        if self.cache is not None:
            invalidations = set(changed) | {name + ":*" for name in everywhere}
            # The overview is a cross-table projection.  Its cache must be
            # invalidated together with any table it summarizes.
            if changed & {"users", "clients", "notifications", "documents", "automations"}:
                invalidations.add("dashboard")
            # "My businesses" joins memberships with businesses, so a membership change refreshes that list too.
            if "business_members" in changed:
                invalidations.add("businesses")
            self.cache.invalidate(invalidations)  # reached only after successful SQL commit
        if changed and self.on_change:
            self.on_change(changed)

    @contextmanager
    def read_transaction(self):
        """Yield repositories for a read path without committing a SQLite transaction."""
        with self.database.read_session() as session:
            yield Repositories(session, self.principal_email)
