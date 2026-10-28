from sqlalchemy import Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.repository.db.models.base import Base, IdentityTimestampMixin


class VideoJob(IdentityTimestampMixin, Base):
    """A video asked for through /videos: from an HTML composition, or from a prompt the AI turns into one."""
    __tablename__ = "video_jobs"
    __table_args__ = (Index("video_job_creator_created", "created_by_id", "created_at"),)

    created_by_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    # "html" (sent ready) or "prompt" (written by the AI)
    source: Mapped[str] = mapped_column(String(8), nullable=False)
    prompt: Mapped[str | None] = mapped_column(Text)
    html: Mapped[str | None] = mapped_column(Text)
    # queued -> generating (prompt only) -> rendering -> done | failed
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="queued")
    fps: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    quality: Mapped[str] = mapped_column(String(8), nullable=False, default="standard")
    error: Mapped[str | None] = mapped_column(String(500))
    file_size: Mapped[int | None] = mapped_column(Integer)
    duration_seconds: Mapped[float | None] = mapped_column(Float)
