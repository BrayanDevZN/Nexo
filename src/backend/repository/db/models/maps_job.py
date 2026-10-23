from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String
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
