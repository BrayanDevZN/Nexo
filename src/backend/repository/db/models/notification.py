from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.repository.db.models.base import Base, IdentityTimestampMixin


class Notification(IdentityTimestampMixin, Base):
    __tablename__ = "notifications"
    __table_args__ = (
        CheckConstraint("decision IN ('approved', 'rejected') OR decision IS NULL",
                        name="notification_decision"),
    )
    kind: Mapped[str] = mapped_column(String(32), default="approval_request")
    announcement_id: Mapped[str | None] = mapped_column(String(36), index=True)
    title: Mapped[str | None] = mapped_column(String(160))
    body: Mapped[str | None] = mapped_column(Text)
    recipient_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True,
    )
    requested_user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True,
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime)
    decision: Mapped[str | None] = mapped_column(String(16))
