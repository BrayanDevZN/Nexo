from sqlalchemy import delete, select

from backend.repository.db.control.base import Repository
from backend.repository.db.models import MapsCredential


class MapsCredentialRepository(Repository[MapsCredential]):
    model = MapsCredential

    def current(self, user_id: str | None = None) -> MapsCredential | None:
        """The member's own key, falling back to the old shared one (the row without a user)."""
        newest = MapsCredential.created_at.desc()
        if user_id:
            own = self.session.scalar(select(MapsCredential).where(MapsCredential.user_id == user_id)
                                      .order_by(newest).limit(1))
            if own is not None:
                return own
        return self.session.scalar(select(MapsCredential).where(MapsCredential.user_id.is_(None))
                                   .order_by(newest).limit(1))

    def replace(self, *, api_key_encrypted: str, key_prefix: str, updated_by_id: str,
                user_id: str | None = None) -> MapsCredential:
        self.session.execute(delete(MapsCredential).where(
            MapsCredential.user_id == user_id if user_id else MapsCredential.user_id.is_(None)))
        return self.add(MapsCredential(api_key_encrypted=api_key_encrypted, key_prefix=key_prefix,
                                       updated_by_id=updated_by_id, user_id=user_id))

    def clear(self, user_id: str | None = None) -> bool:
        return self.session.execute(delete(MapsCredential).where(
            MapsCredential.user_id == user_id if user_id else MapsCredential.user_id.is_(None))).rowcount > 0
