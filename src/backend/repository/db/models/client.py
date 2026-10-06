from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.repository.db.models.base import Base, IdentityTimestampMixin


class Client(IdentityTimestampMixin, Base):
    __tablename__ = "clients"
    __table_args__ = (
        CheckConstraint("length(trim(name)) > 0", name="client_name_nonempty"),
        CheckConstraint("length(trim(niche)) > 0", name="client_niche_nonempty"),
        CheckConstraint("pipeline_stage IN ('lead', 'contacted', 'diagnosis', 'proposal', 'negotiation', 'won', 'lost')",
                        name="client_pipeline_stage"),
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    niche: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(32))
    email: Mapped[str | None] = mapped_column(String(254))
    contract_closed: Mapped[bool] = mapped_column(Boolean(create_constraint=True), default=False)
    contract_value: Mapped[float | None] = mapped_column(Numeric(12, 2))
    pipeline_stage: Mapped[str] = mapped_column(String(24), default="lead", index=True)
    next_follow_up: Mapped[datetime | None] = mapped_column(DateTime)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True,
    )
