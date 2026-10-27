from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.repository.db.models.base import Base, IdentityTimestampMixin


class MapsJob(IdentityTimestampMixin, Base):
    """A search started from the panel, tracked so its creator is told when it finishes."""
    __tablename__ = "maps_jobs"
    __table_args__ = (Index("maps_job_pending", "notified_at", "created_at"),)

    job_id: Mapped[str] = mapped_column(String(36), unique=True, nullable=False)
    created_by_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    niche: Mapped[str | None] = mapped_column(String(120))
    notified_at: Mapped[datetime | None] = mapped_column(DateTime)
    # Searches in the default place widen their radius by themselves when they find nothing.
    auto_expand: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="0")
    radius: Mapped[int | None] = mapped_column(Integer)
    start_radius: Mapped[int | None] = mapped_column(Integer)
    # The request sent to the maps server (JSON), so the same search can be repeated with a bigger radius.
    params: Mapped[str | None] = mapped_column(Text)
    expanded_to: Mapped[str | None] = mapped_column(String(36))
    # How many companies the creator wants to see (None = all); kept when the search is widened.
    max_leads: Mapped[int | None] = mapped_column(Integer)
    # Which contact the creator wants in the leads (any, whatsapp, email, ...); the notices only count those.
    contact: Mapped[str | None] = mapped_column(String(16))
