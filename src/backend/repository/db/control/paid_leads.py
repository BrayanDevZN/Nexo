from sqlalchemy import select

from backend.repository.db.control.base import Repository, pagination
from backend.repository.db.models import PaidLead
from backend.repository.db.models.base import utc_now

_EDITABLE = {"stage", "name", "phone", "email", "notes", "contract_value"}


class PaidLeadRepository(Repository[PaidLead]):
    model = PaidLead

    def create(self, *, source: str, page: str, click_id: str | None = None) -> PaidLead:
        return self.add(PaidLead(source=source, page=page, click_id=click_id, stage="visited"))

    def by_click_id(self, click_id: str) -> PaidLead | None:
        return self.session.scalar(select(PaidLead).where(PaidLead.click_id == click_id).order_by(PaidLead.created_at))

    def list(self, *, stage: str | None = None, limit: int = 50, offset: int = 0) -> list[PaidLead]:
        pagination(limit, offset)
        query = select(PaidLead).order_by(PaidLead.created_at.desc(), PaidLead.id)
        if stage is not None:
            query = query.where(PaidLead.stage == stage)
        return list(self.session.scalars(query.limit(limit).offset(offset)))

    def mark_whatsapp_click(self, lead: PaidLead, placement: str) -> bool:
        """Move a visitor to the WhatsApp stage. A lead already further along in the funnel is left alone."""
        if lead.stage != "visited":
            return False
        lead.stage, lead.placement, lead.whatsapp_clicked_at = "whatsapp_click", placement, utc_now()
        self.session.flush()
        return True

    def update(self, lead: PaidLead, **changes) -> PaidLead:
        if set(changes) - _EDITABLE:
            raise ValueError("Unsupported paid lead fields")
        for field, value in changes.items():
            setattr(lead, field, value)
        self.session.flush()
        return lead
