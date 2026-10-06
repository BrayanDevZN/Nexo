from sqlalchemy import select, update

from backend.repository.db.control.base import Repository, pagination
from backend.repository.db.models import Client


class ClientRepository(Repository[Client]):
    model = Client

    def create(self, *, name: str, niche: str, created_by_id: str,
               contract_closed: bool = False, phone: str | None = None,
               email: str | None = None, notes: str | None = None) -> Client:
        if not name.strip() or not niche.strip():
            raise ValueError("Name and niche are required")
        return self.add(Client(name=name.strip(), niche=niche.strip(),
                               created_by_id=created_by_id, contract_closed=contract_closed,
                               phone=phone, email=email, notes=notes))

    def list(self, *, niche: str | None = None, contract_closed: bool | None = None,
             limit: int = 50, offset: int = 0) -> list[Client]:
        pagination(limit, offset)
        query = select(Client).order_by(Client.created_at, Client.id)
        if niche is not None:
            query = query.where(Client.niche == niche)
        if contract_closed is not None:
            query = query.where(Client.contract_closed == contract_closed)
        return list(self.session.scalars(query.limit(limit).offset(offset)))

    def update(self, client: Client, **changes) -> Client:
        allowed = {"name", "niche", "phone", "email", "contract_closed", "notes"}
        if set(changes) - allowed:
            raise ValueError("Unsupported client fields")
        for field, value in changes.items():
            if field in {"name", "niche"}:
                if not isinstance(value, str) or not value.strip():
                    raise ValueError("Name and niche are required")
                value = value.strip()
            setattr(client, field, value)
        self.session.flush()
        return client

    def transfer_creator(self, previous_id, owner_id):
        result = self.session.execute(update(Client).where(Client.created_by_id == previous_id).values(
            created_by_id=owner_id), execution_options={"synchronize_session": False})
        if result.rowcount:
            self.session.info.setdefault("cache_dirty_tables", set()).add("clients")
