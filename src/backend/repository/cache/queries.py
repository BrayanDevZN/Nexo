from datetime import datetime
from decimal import Decimal

from backend.repository.cache.aside import CacheAside
from backend.repository.db.control.base import pagination
from backend.repository.db.control.manager import Repositories

FIELDS = {
    "chat_messages": ("id", "sequence", "sender_id", "recipient_id", "sender_name", "client_id",
                      "text", "kind", "media_type", "size", "created_at"),
    "users": ("id", "name", "email", "phone", "profile_photo", "status", "role",
              "created_at", "updated_at"),
    "documents": ("id", "filename", "size", "created_by_id", "created_at", "updated_at"),
    "clients": ("id", "name", "niche", "phone", "email", "contract_closed", "contract_value", "notes",
                "created_by_id", "created_at", "updated_at"),
    "notifications": ("id", "kind", "announcement_id", "title", "body", "recipient_id", "requested_user_id", "read_at",
                      "resolved_at", "decision", "created_at", "updated_at"),
}


def snapshot(table: str, row):
    if row is None:
        return None
    result = {}
    for field in FIELDS[table]:
        value = getattr(row, field)
        result[field] = value.isoformat() + "Z" if isinstance(value, datetime) else float(value) if isinstance(value, Decimal) else value
    return result


class CachedQueries:
    def __init__(self, table: str, repository, cache: CacheAside, session):
        self.table, self.repository, self.cache, self.session = table, repository, cache, session

    def _read(self, query, loader):
        # Never publish data from a transaction that has made changes, even after a flush.
        if (self.session.info.get("cache_dirty_tables") or self.session.new
                or self.session.dirty or self.session.deleted):
            return loader()
        return self.cache.read(self.table, query, loader)

    def get(self, identifier: str):
        return self._read({"operation": "get", "id": identifier},
                          lambda: snapshot(self.table, self.repository.get(identifier)))

    def list(self, **filters):
        if self.table == "notifications":
            raise ValueError("Use list_for_recipient for notifications")
        pagination(filters.get("limit", 50), filters.get("offset", 0))
        return self._read({"operation": "list", **filters},
                          lambda: [snapshot(self.table, row)
                                   for row in self.repository.list(**filters)])

    def list_for_recipient(self, recipient_id: str, **filters):
        if self.table != "notifications":
            raise ValueError("Recipient filters apply only to notifications")
        pagination(filters.get("limit", 50), filters.get("offset", 0))
        return self._read({"operation": "list", "recipient_id": recipient_id, **filters},
                          lambda: [snapshot(self.table, row) for row in
                                   self.repository.list_for_recipient(recipient_id, **filters)])


class CachedRepositories:
    def __init__(self, repositories: Repositories, cache: CacheAside, session):
        # Mutations and authoritative authentication reads use .db, in the same transaction.
        self.db = repositories
        for table in FIELDS:
            setattr(self, table, CachedQueries(table, getattr(repositories, table), cache, session))
