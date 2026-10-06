from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.repository.db.models.base import Base, IdentityTimestampMixin


class Client(IdentityTimestampMixin, Base):
    __tablename__ = "clients"
    __table_args__ = (
        CheckConstraint("length(trim(name)) > 0", name="client_name_nonempty"),
        CheckConstraint("length(trim(niche)) > 0", name="client_niche_nonempty"),
        CheckConstraint("pipeline_stage IN ('lead', 'contacted', 'diagnosis', 'proposal', 'negotiation', 'won', 'lost')",
                        name="client_pipeline_stage"),
        Index("client_created_at_id", "created_at", "id"),
        Index("client_closed_created_at", "contract_closed", "created_at"),
        Index("client_creator_created_at", "created_by_id", "created_at"),
        Index("client_niche_created_at", "niche", "created_at"),
        Index("client_stage_created_at", "pipeline_stage", "created_at"),
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    niche: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(32))
    email: Mapped[str | None] = mapped_column(String(254))
    contract_closed: Mapped[bool] = mapped_column(Boolean(create_constraint=True), default=False)
    contract_value: Mapped[float | None] = mapped_column(Numeric(12, 2))
    pipeline_stage: Mapped[str] = mapped_column(String(24), default="lead")
    next_follow_up: Mapped[datetime | None] = mapped_column(DateTime)
    notes: Mapped[str | None] = mapped_column(Text)
    pain: Mapped[str | None] = mapped_column(Text)
    approach: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False,
    )
