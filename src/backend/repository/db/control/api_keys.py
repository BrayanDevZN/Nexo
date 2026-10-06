from datetime import datetime

from sqlalchemy import select, update

from backend.repository.db.control.base import Repository, pagination
from backend.repository.db.models import ApiKey


class ApiKeyRepository(Repository[ApiKey]):
    model = ApiKey

    def create(self, *, user_id: str, name: str, key_prefix: str, key_hash: str) -> ApiKey:
        clean_name = name.strip()
        if not clean_name:
            raise ValueError("API key name is required")
        return self.add(ApiKey(user_id=user_id, name=clean_name[:80], key_prefix=key_prefix, key_hash=key_hash))

    def list_for_user(self, user_id: str, *, limit: int = 100, offset: int = 0) -> list[ApiKey]:
        pagination(limit, offset)
        return list(self.session.scalars(select(ApiKey).where(
            ApiKey.user_id == user_id, ApiKey.revoked_at.is_(None),
        ).order_by(ApiKey.created_at.desc(), ApiKey.id).limit(limit).offset(offset)))

    def active_by_hash(self, key_hash: str) -> ApiKey | None:
        return self.session.scalar(select(ApiKey).where(
            ApiKey.key_hash == key_hash, ApiKey.revoked_at.is_(None),
        ))

    def touch(self, key: ApiKey, used_at: datetime) -> None:
        self.session.execute(update(ApiKey).where(
            ApiKey.id == key.id, ApiKey.revoked_at.is_(None),
        ).values(last_used_at=used_at), execution_options={"synchronize_session": False})

    def revoke(self, user_id: str, identifier: str, revoked_at: datetime) -> bool:
        result = self.session.execute(update(ApiKey).where(
            ApiKey.id == identifier, ApiKey.user_id == user_id, ApiKey.revoked_at.is_(None),
        ).values(revoked_at=revoked_at), execution_options={"synchronize_session": False})
        return result.rowcount == 1
