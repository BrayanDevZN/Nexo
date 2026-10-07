from datetime import date, datetime, timedelta

from sqlalchemy import select, update

from backend.repository.db.control.base import Repository, pagination
from backend.repository.db.models import ApiKey, ApiKeyUsage


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

    def record_usage(self, key_id: str, usage_date: date) -> None:
        usage = self.session.scalar(select(ApiKeyUsage).where(
            ApiKeyUsage.api_key_id == key_id, ApiKeyUsage.usage_date == usage_date,
        ))
        if usage is None:
            self.session.add(ApiKeyUsage(api_key_id=key_id, usage_date=usage_date, request_count=1))
        else:
            usage.request_count += 1

    def usage_for_user(self, user_id: str, days: int) -> list[dict]:
        start = date.today() - timedelta(days=days - 1)
        rows = self.session.execute(
            select(ApiKeyUsage.usage_date, ApiKeyUsage.request_count, ApiKey.id, ApiKey.name)
            .join(ApiKey, ApiKey.id == ApiKeyUsage.api_key_id)
            .where(ApiKey.user_id == user_id, ApiKeyUsage.usage_date >= start)
            .order_by(ApiKeyUsage.usage_date.asc(), ApiKey.name.asc())
        ).all()
        return [{"date": item.usage_date, "count": item.request_count,
                 "api_key_id": item.id, "api_key_name": item.name} for item in rows]

    def revoke(self, user_id: str, identifier: str, revoked_at: datetime) -> bool:
        result = self.session.execute(update(ApiKey).where(
            ApiKey.id == identifier, ApiKey.user_id == user_id, ApiKey.revoked_at.is_(None),
        ).values(revoked_at=revoked_at), execution_options={"synchronize_session": False})
        return result.rowcount == 1
