from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Index, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.domain.paid_leads import PAID_LEAD_STAGES
from backend.repository.db.models.base import Base, IdentityTimestampMixin

_STAGES = ", ".join(f"'{stage}'" for stage in PAID_LEAD_STAGES)


class PaidLead(IdentityTimestampMixin, Base):
    """One visitor that came from a paid ad, kept apart from the clients table."""
    __tablename__ = "paid_leads"
    __table_args__ = (
        CheckConstraint(f"stage IN ({_STAGES})", name="paid_lead_stage"),
        Index("paid_lead_stage_created_at", "stage", "created_at"),
        Index("paid_lead_click_id", "click_id"),
    )
    stage: Mapped[str] = mapped_column(String(24), default="visited", nullable=False)
    source: Mapped[str] = mapped_column(String(30), nullable=False)
    click_id: Mapped[str | None] = mapped_column(String(200))
    page: Mapped[str] = mapped_column(String(40), nullable=False)
    placement: Mapped[str | None] = mapped_column(String(30))
    whatsapp_clicked_at: Mapped[datetime | None] = mapped_column(DateTime)
    name: Mapped[str | None] = mapped_column(String(160))
    phone: Mapped[str | None] = mapped_column(String(32))
    email: Mapped[str | None] = mapped_column(String(254))
    notes: Mapped[str | None] = mapped_column(Text)
    contract_value: Mapped[float | None] = mapped_column(Numeric(12, 2))
