from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.repository.db.models.base import Base, IdentityTimestampMixin


class AutomationRequest(IdentityTimestampMixin, Base):
    __tablename__ = "automation_requests"
    __table_args__ = (
        CheckConstraint("status IN ('pending', 'invited', 'rejected')",
                        name="automation_request_status"),
        Index("automation_request_created_at_id", "created_at", "id"),
        Index("automation_request_requester_created", "requested_by_id", "created_at"),
    )

    requested_by_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
    )
    # Unique while pending; NULL after a decision, allowing a later request.
    active_requester_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True,
    )
    details: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="pending", nullable=False)
    invite_url: Mapped[str | None] = mapped_column(Text)
    admin_message: Mapped[str | None] = mapped_column(Text)
    reviewed_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime)
