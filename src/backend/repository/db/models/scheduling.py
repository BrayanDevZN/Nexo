"""Tables of the scheduling product (/atendimentos). They share the database with the panel but never its users."""
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from backend.domain.scheduling import APPOINTMENT_STATUSES, BUSINESS_ROLES, INVITABLE_ROLES
from backend.repository.db.models.base import Base, IdentityTimestampMixin

_ROLES = ", ".join(f"'{role}'" for role in BUSINESS_ROLES)
_INVITABLE = ", ".join(f"'{role}'" for role in INVITABLE_ROLES)
_STATUSES = ", ".join(f"'{status}'" for status in APPOINTMENT_STATUSES)


class BookingUser(IdentityTimestampMixin, Base):
    """A personal account of the scheduling product: no approval, no panel role."""
    __tablename__ = "booking_users"
    __table_args__ = (
        CheckConstraint("session_version >= 0", name="booking_user_session_version_nonnegative"),
        CheckConstraint("password_hash IS NOT NULL OR google_sub IS NOT NULL", name="booking_user_identity"),
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False)
    phone: Mapped[str | None] = mapped_column(String(32))
    password_hash: Mapped[str | None] = mapped_column(String(255))
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True)
    session_version: Mapped[int] = mapped_column(default=0)


class Business(IdentityTimestampMixin, Base):
    __tablename__ = "businesses"
    __table_args__ = (
        CheckConstraint("length(trim(name)) > 0", name="business_name_nonempty"),
        Index("business_owner_created_at", "owner_id", "created_at"),
    )
    owner_id: Mapped[str] = mapped_column(ForeignKey("booking_users.id", ondelete="RESTRICT"), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(String(32))
    email: Mapped[str | None] = mapped_column(String(254))
    address: Mapped[str | None] = mapped_column(String(300))
    city: Mapped[str | None] = mapped_column(String(120))
    state: Mapped[str | None] = mapped_column(String(2))
    timezone: Mapped[str] = mapped_column(String(64), default="America/Sao_Paulo", nullable=False)
    # JSON text: {"mon": [["09:00", "18:00"]], ...}; validated by domain.scheduling.validate_opening_hours.
    opening_hours: Mapped[str] = mapped_column(Text, default="{}", nullable=False)


class BusinessMember(IdentityTimestampMixin, Base):
    __tablename__ = "business_members"
    __table_args__ = (
        CheckConstraint(f"role IN ({_ROLES})", name="business_member_role"),
        UniqueConstraint("business_id", "user_id", name="business_member_unique"),
        Index("business_member_user", "user_id", "created_at"),
    )
    business_id: Mapped[str] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("booking_users.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)


class BusinessInvitation(IdentityTimestampMixin, Base):
    """A single-use link that adds an account to a business with a role. Only the token's hash is stored."""
    __tablename__ = "business_invitations"
    __table_args__ = (
        CheckConstraint(f"role IN ({_INVITABLE})", name="business_invitation_role"),
        Index("business_invitation_business_created", "business_id", "created_at"),
    )
    business_id: Mapped[str] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    email: Mapped[str | None] = mapped_column(String(254))
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    created_by_id: Mapped[str] = mapped_column(ForeignKey("booking_users.id", ondelete="CASCADE"), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime)
    accepted_by_id: Mapped[str | None] = mapped_column(ForeignKey("booking_users.id", ondelete="SET NULL"))


class BusinessService(IdentityTimestampMixin, Base):
    __tablename__ = "business_services"
    __table_args__ = (
        CheckConstraint("length(trim(name)) > 0", name="business_service_name_nonempty"),
        CheckConstraint("duration_minutes > 0", name="business_service_duration_positive"),
        Index("business_service_business_created", "business_id", "created_at"),
    )
    business_id: Mapped[str] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    duration_minutes: Mapped[int] = mapped_column(nullable=False)
    price: Mapped[float | None] = mapped_column(Numeric(10, 2))
    active: Mapped[bool] = mapped_column(Boolean(create_constraint=True), default=True, nullable=False)


class Appointment(IdentityTimestampMixin, Base):
    __tablename__ = "appointments"
    __table_args__ = (
        CheckConstraint(f"status IN ({_STATUSES})", name="appointment_status"),
        CheckConstraint("ends_at > starts_at", name="appointment_ends_after_start"),
        CheckConstraint("length(trim(customer_name)) > 0", name="appointment_customer_nonempty"),
        Index("appointment_business_starts", "business_id", "starts_at"),
        Index("appointment_staff_starts", "staff_user_id", "starts_at"),
    )
    business_id: Mapped[str] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    # The service may be deleted later; its name is kept so the history still reads well.
    service_id: Mapped[str | None] = mapped_column(ForeignKey("business_services.id", ondelete="SET NULL"))
    service_name: Mapped[str] = mapped_column(String(160), nullable=False)
    staff_user_id: Mapped[str | None] = mapped_column(ForeignKey("booking_users.id", ondelete="SET NULL"))
    customer_name: Mapped[str] = mapped_column(String(160), nullable=False)
    customer_phone: Mapped[str | None] = mapped_column(String(32))
    customer_email: Mapped[str | None] = mapped_column(String(254))
    starts_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="scheduled", nullable=False)
    price: Mapped[float | None] = mapped_column(Numeric(10, 2))
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("booking_users.id", ondelete="SET NULL"))
