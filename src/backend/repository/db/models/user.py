from sqlalchemy import CheckConstraint, Index, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column

from backend.repository.db.models.base import Base, IdentityTimestampMixin


class User(IdentityTimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("status IN ('pending', 'approved', 'rejected')", name="user_status"),
        CheckConstraint("role IN ('member', 'admin')", name="user_role"),
        CheckConstraint("session_version >= 0", name="session_version_nonnegative"),
        CheckConstraint("password_hash IS NOT NULL OR google_sub IS NOT NULL", name="user_identity"),
        Index("user_status_created_at_id", "status", "created_at", "id"),
        Index("user_role_created_at_id", "role", "created_at", "id"),
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False)
    phone: Mapped[str | None] = mapped_column(String(32))
    password_hash: Mapped[str | None] = mapped_column(String(255))
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True)
    profile_photo: Mapped[str | None] = mapped_column(String(255))
    profile_photo_data: Mapped[bytes | None] = mapped_column(LargeBinary)
    status: Mapped[str] = mapped_column(String(16), default="pending")
    role: Mapped[str] = mapped_column(String(16), default="member")
    session_version: Mapped[int] = mapped_column(default=0)
