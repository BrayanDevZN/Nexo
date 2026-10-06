from sqlalchemy import case, func, select, update

from backend.repository.db.control.base import Repository, pagination
from backend.repository.db.models import Client


class ClientRepository(Repository[Client]):
    model = Client

    def create(self, *, name: str, niche: str, created_by_id: str,
               contract_closed: bool = False, phone: str | None = None,
               email: str | None = None, notes: str | None = None,
               contract_value=None, pipeline_stage: str = "lead",
               next_follow_up=None) -> Client:
        if not name.strip() or not niche.strip():
            raise ValueError("Name and niche are required")
        if contract_closed and pipeline_stage == "lead":
            pipeline_stage = "won"
        if pipeline_stage == "won":
            contract_closed = True
        return self.add(Client(name=name.strip(), niche=niche.strip(),
                               created_by_id=created_by_id, contract_closed=contract_closed,
                               phone=phone, email=email, notes=notes, contract_value=contract_value,
                               pipeline_stage=pipeline_stage, next_follow_up=next_follow_up))

    def list(self, *, niche: str | None = None, contract_closed: bool | None = None,
             name: str | None = None, created_by_id: str | None = None,
             pipeline_stage: str | None = None,
             limit: int = 50, offset: int = 0) -> list[Client]:
        pagination(limit, offset)
        query = select(Client).order_by(Client.created_at, Client.id)
        if name:
            query = query.where(Client.name.icontains(name, autoescape=True))
        if created_by_id:
            query = query.where(Client.created_by_id == created_by_id)
        if niche is not None:
            query = query.where(Client.niche == niche)
        if contract_closed is not None:
            query = query.where(Client.contract_closed == contract_closed)
        if pipeline_stage is not None:
            query = query.where(Client.pipeline_stage == pipeline_stage)
        return list(self.session.scalars(query.limit(limit).offset(offset)))

    def update(self, client: Client, **changes) -> Client:
        allowed = {"name", "niche", "phone", "email", "contract_closed", "contract_value",
                   "pipeline_stage", "next_follow_up", "notes"}
        if set(changes) - allowed:
            raise ValueError("Unsupported client fields")
        for field, value in changes.items():
            if field in {"name", "niche"}:
                if not isinstance(value, str) or not value.strip():
                    raise ValueError("Name and niche are required")
                value = value.strip()
            setattr(client, field, value)
        if changes.get("contract_closed") is True:
            client.pipeline_stage = "won"
        if changes.get("pipeline_stage") == "won":
            client.contract_closed = True
        self.session.flush()
        return client


    def count(self) -> int:
        return int(self.session.scalar(select(func.count()).select_from(Client)) or 0)

    def count_contracts_between(self, start, end) -> int:
        return int(self.session.scalar(select(func.count()).select_from(Client).where(
            Client.contract_closed.is_(True), Client.created_at >= start, Client.created_at < end
        )) or 0)

    def funnel_counts(self) -> dict[str, int]:
        rows = self.session.execute(select(Client.pipeline_stage, func.count()).group_by(Client.pipeline_stage))
        return {stage: int(count) for stage, count in rows}

    def value_totals(self) -> tuple[float, float]:
        total = self.session.scalar(select(func.coalesce(func.sum(Client.contract_value), 0))) or 0
        closed = self.session.scalar(select(func.coalesce(func.sum(Client.contract_value), 0)).where(
            Client.contract_closed.is_(True))) or 0
        return float(total), float(closed)

    def dashboard_metrics(self, start, end) -> tuple[int, float, float, dict[str, int], dict[str, int]]:
        """Return all client aggregates for the overview in three SQL queries."""
        totals = self.session.execute(select(
            func.count(Client.id),
            func.coalesce(func.sum(Client.contract_value), 0),
            func.coalesce(func.sum(case((Client.contract_closed.is_(True), Client.contract_value), else_=0)), 0),
        )).one()
        funnel = {stage: int(count) for stage, count in self.session.execute(
            select(Client.pipeline_stage, func.count()).group_by(Client.pipeline_stage)
        )}
        months = {month: int(count) for month, count in self.session.execute(
            select(func.strftime("%Y-%m", Client.created_at), func.count()).where(
                Client.contract_closed.is_(True), Client.created_at >= start, Client.created_at < end,
            ).group_by(func.strftime("%Y-%m", Client.created_at))
        )}
        return int(totals[0] or 0), float(totals[1] or 0), float(totals[2] or 0), funnel, months

    def transfer_creator(self, previous_id, owner_id):
        result = self.session.execute(update(Client).where(Client.created_by_id == previous_id).values(
            created_by_id=owner_id), execution_options={"synchronize_session": False})
        if result.rowcount:
            self.session.info.setdefault("cache_dirty_tables", set()).add("clients")
