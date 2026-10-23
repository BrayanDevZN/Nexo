from sqlalchemy import delete, select

from backend.repository.db.control.base import Repository
from backend.repository.db.models import MapsCredential


class MapsCredentialRepository(Repository[MapsCredential]):
    model = MapsCredential

    def current(self) -> MapsCredential | None:
        return self.session.scalar(select(MapsCredential).order_by(MapsCredential.created_at.desc()).limit(1))

    def replace(self, *, api_key_encrypted: str, key_prefix: str, updated_by_id: str) -> MapsCredential:
        self.session.execute(delete(MapsCredential))
        return self.add(MapsCredential(api_key_encrypted=api_key_encrypted, key_prefix=key_prefix,
                                       updated_by_id=updated_by_id))

    def clear(self) -> bool:
        return self.session.execute(delete(MapsCredential)).rowcount > 0
