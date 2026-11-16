"""SQL access of the scheduling product. Every query of a business is scoped by business_id."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.orm import load_only

from backend.domain.scheduling import (
    ACTIVE_STATUSES,
    APPOINTMENT_STATUSES,
    BUSINESS_ROLES,
    INVITABLE_ROLES,
)
from backend.repository.db.control.base import Repository, pagination
from backend.repository.db.models import (
    Appointment,
    BookingUser,
    Business,
    BusinessInvitation,
    BusinessMember,
    BusinessService,
)
from backend.repository.db.models.base import utc_now

# Tables whose cache generation is kept per business ("appointments:<business_id>") and not only per table.
BUSINESS_SCOPED_TABLES = frozenset({"business_members", "business_invitations", "business_services", "appointments"})
SCHEDULING_TABLES = frozenset({"booking_users", "businesses", *BUSINESS_SCOPED_TABLES})

FIELDS = {
    "booking_users": ("id", "name", "email", "phone", "created_at", "updated_at"),
    "businesses": ("id", "owner_id", "name", "slug", "description", "phone", "email", "address", "city", "state",
                   "timezone", "opening_hours", "created_at", "updated_at"),
    "business_members": ("id", "business_id", "user_id", "role", "created_at", "updated_at"),
    "business_invitations": ("id", "business_id", "email", "role", "created_by_id", "expires_at", "accepted_at",
                             "accepted_by_id", "created_at", "updated_at"),
    "business_services": ("id", "business_id", "name", "description", "duration_minutes", "price", "active",
                          "created_at", "updated_at"),
    "appointments": ("id", "business_id", "service_id", "service_name", "staff_user_id", "customer_name",
                     "customer_phone", "customer_email", "starts_at", "ends_at", "status", "price", "notes",
                     "created_by_id", "created_at", "updated_at"),
}


def snapshot(table: str, row) -> dict | None:
    """A JSON-safe copy of a row, the shape the cache stores and the API returns."""
    if row is None:
        return None
    result = {}
    for field in FIELDS[table]:
        value = getattr(row, field)
        if isinstance(value, datetime):
            value = value.isoformat() + "Z"
        elif isinstance(value, Decimal):
            value = float(value)
        elif field == "opening_hours":
            value = json.loads(value or "{}")
        result[field] = value
    return result


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _mark_dirty(session, table: str, business_id: str | None = None) -> None:
    dirty = session.info.setdefault("cache_dirty_tables", set())
    dirty.add(table)
    if business_id and table in BUSINESS_SCOPED_TABLES:
        dirty.add(table + ":" + business_id)


class BookingUserRepository(Repository[BookingUser]):
    model = BookingUser

    def create(self, *, name: str, email: str, phone: str | None = None,
               password_hash: str | None = None, google_sub: str | None = None) -> BookingUser:
        if not name.strip() or not email.strip():
            raise ValueError("Name and email are required")
        return self.add(BookingUser(name=name.strip(), email=email.strip().lower(), phone=phone,
                                    password_hash=password_hash, google_sub=google_sub))

    def by_email(self, email: str) -> BookingUser | None:
        return self.session.scalar(select(BookingUser).where(BookingUser.email == email.strip().lower()))

    def by_google_sub(self, subject: str) -> BookingUser | None:
        return self.session.scalar(select(BookingUser).where(BookingUser.google_sub == subject))

    def for_auth(self, identifier: str) -> BookingUser | None:
        return self.session.scalar(select(BookingUser).options(load_only(
            BookingUser.id, BookingUser.name, BookingUser.email, BookingUser.phone, BookingUser.session_version,
        )).where(BookingUser.id == identifier))

    def summaries_by_ids(self, identifiers) -> dict[str, dict]:
        values = sorted({str(identifier) for identifier in identifiers if identifier})
        if not values:
            return {}
        return {user_id: {"name": name, "email": email} for user_id, name, email in self.session.execute(
            select(BookingUser.id, BookingUser.name, BookingUser.email).where(BookingUser.id.in_(values))).all()}

    def revoke_sessions(self, user: BookingUser) -> None:
        self.session.flush()
        self.session.execute(update(BookingUser).where(BookingUser.id == user.id).values(
            session_version=BookingUser.session_version + 1), execution_options={"synchronize_session": False})
        _mark_dirty(self.session, "booking_users")
        self.session.refresh(user)

    def replace_password_if_current(self, identifier: str, version: int, hashed: str) -> bool:
        if not hashed:
            raise ValueError("Password hash is required")
        result = self.session.execute(update(BookingUser).where(
            BookingUser.id == identifier, BookingUser.session_version == version,
            BookingUser.password_hash.is_not(None),
        ).values(password_hash=hashed, session_version=BookingUser.session_version + 1),
            execution_options={"synchronize_session": False})
        if result.rowcount:
            _mark_dirty(self.session, "booking_users")
        return result.rowcount == 1

    def set_profile_fields(self, user: BookingUser, *, name: str, phone: str | None) -> bool:
        if not name.strip():
            raise ValueError("Name is required")
        result = self.session.execute(update(BookingUser).where(
            BookingUser.id == user.id, BookingUser.session_version == user.session_version,
        ).values(name=name.strip(), phone=phone), execution_options={"synchronize_session": False})
        _mark_dirty(self.session, "booking_users")
        self.session.refresh(user)
        return result.rowcount == 1

    def link_google_if_local(self, user: BookingUser, subject: str) -> bool:
        result = self.session.execute(update(BookingUser).where(
            BookingUser.id == user.id, BookingUser.email == user.email,
            BookingUser.session_version == user.session_version,
            BookingUser.password_hash.is_not(None), BookingUser.google_sub.is_(None),
        ).values(google_sub=subject), execution_options={"synchronize_session": False})
        if result.rowcount:
            _mark_dirty(self.session, "booking_users")
        self.session.refresh(user)
        return result.rowcount == 1


class BusinessRepository(Repository[Business]):
    model = Business

    def create(self, *, owner_id: str, name: str, slug: str, opening_hours: dict, **fields) -> Business:
        if not name.strip():
            raise ValueError("Name is required")
        row = self.add(Business(owner_id=owner_id, name=name.strip(), slug=slug,
                                opening_hours=json.dumps(opening_hours, separators=(",", ":")), **fields))
        # The creator is the first member; every permission check reads this table.
        self.session.add(BusinessMember(business_id=row.id, user_id=owner_id, role="owner"))
        self.session.flush()
        return row

    def slug_taken(self, slug: str) -> bool:
        return self.session.scalar(select(func.count()).select_from(Business).where(Business.slug == slug)) > 0

    def update(self, business: Business, **changes) -> Business:
        allowed = {"name", "description", "phone", "email", "address", "city", "state", "timezone", "opening_hours"}
        if set(changes) - allowed:
            raise ValueError("Unsupported business fields")
        for field, value in changes.items():
            if field == "name":
                if not isinstance(value, str) or not value.strip():
                    raise ValueError("Name is required")
                value = value.strip()
            elif field == "opening_hours":
                value = json.dumps(value, separators=(",", ":"))
            setattr(business, field, value)
        self.session.flush()
        return business

    def delete_business(self, business: Business) -> None:
        # SQLite cascades the children; the cache must learn about every table that lost rows.
        for table in BUSINESS_SCOPED_TABLES:
            _mark_dirty(self.session, table, business.id)
        self.session.delete(business)
        self.session.flush()

    def list_for_user(self, user_id: str) -> list[tuple[Business, str]]:
        """Every business the account belongs to, with the role it holds there."""
        rows = self.session.execute(
            select(Business, BusinessMember.role).join(BusinessMember, BusinessMember.business_id == Business.id)
            .where(BusinessMember.user_id == user_id).order_by(Business.created_at, Business.id)).all()
        return [(business, role) for business, role in rows]

    # Members -----------------------------------------------------------------------------------------------

    def membership(self, business_id: str, user_id: str) -> BusinessMember | None:
        return self.session.scalar(select(BusinessMember).where(
            BusinessMember.business_id == business_id, BusinessMember.user_id == user_id))

    def members(self, business_id: str) -> list[BusinessMember]:
        return list(self.session.scalars(select(BusinessMember).where(BusinessMember.business_id == business_id)
                                         .order_by(BusinessMember.created_at, BusinessMember.id)))

    def add_member(self, business_id: str, user_id: str, role: str) -> BusinessMember:
        if role not in BUSINESS_ROLES:
            raise ValueError("Invalid role")
        return self.add(BusinessMember(business_id=business_id, user_id=user_id, role=role))

    def set_role(self, member: BusinessMember, role: str) -> BusinessMember:
        if role not in BUSINESS_ROLES:
            raise ValueError("Invalid role")
        member.role = role
        self.session.flush()
        return member

    def remove_member(self, member: BusinessMember) -> None:
        self.session.delete(member)
        self.session.flush()

    # Invitations -------------------------------------------------------------------------------------------

    def create_invitation(self, *, business_id: str, email: str | None, role: str, token: str,
                          created_by_id: str, ttl: timedelta) -> BusinessInvitation:
        if role not in INVITABLE_ROLES:
            raise ValueError("Invalid role")
        return self.add(BusinessInvitation(business_id=business_id, email=email.strip().lower() if email else None,
                                           role=role, token_hash=token_hash(token), created_by_id=created_by_id,
                                           expires_at=utc_now() + ttl))

    def invitation_by_token(self, token: str) -> BusinessInvitation | None:
        return self.session.scalar(select(BusinessInvitation).where(BusinessInvitation.token_hash == token_hash(token)))

    def invitation(self, business_id: str, identifier: str) -> BusinessInvitation | None:
        return self.session.scalar(select(BusinessInvitation).where(
            BusinessInvitation.business_id == business_id, BusinessInvitation.id == identifier))

    def pending_invitations(self, business_id: str) -> list[BusinessInvitation]:
        return list(self.session.scalars(select(BusinessInvitation).where(
            BusinessInvitation.business_id == business_id, BusinessInvitation.accepted_at.is_(None),
            BusinessInvitation.expires_at > utc_now()).order_by(BusinessInvitation.created_at, BusinessInvitation.id)))

    def accept_invitation(self, invitation: BusinessInvitation, user_id: str) -> bool:
        """Mark the link used; only the first concurrent acceptance wins."""
        result = self.session.execute(update(BusinessInvitation).where(
            BusinessInvitation.id == invitation.id, BusinessInvitation.accepted_at.is_(None),
            BusinessInvitation.expires_at > utc_now(),
        ).values(accepted_at=utc_now(), accepted_by_id=user_id), execution_options={"synchronize_session": False})
        _mark_dirty(self.session, "business_invitations", invitation.business_id)
        self.session.refresh(invitation)
        return result.rowcount == 1

    def delete_invitation(self, invitation: BusinessInvitation) -> None:
        self.session.delete(invitation)
        self.session.flush()


class BusinessServiceRepository(Repository[BusinessService]):
    model = BusinessService

    def create(self, *, business_id: str, name: str, duration_minutes: int, description: str | None = None,
               price=None, active: bool = True) -> BusinessService:
        if not name.strip() or duration_minutes <= 0:
            raise ValueError("Name and a positive duration are required")
        return self.add(BusinessService(business_id=business_id, name=name.strip(), description=description,
                                        duration_minutes=duration_minutes, price=price, active=active))

    def in_business(self, business_id: str, identifier: str) -> BusinessService | None:
        return self.session.scalar(select(BusinessService).where(
            BusinessService.business_id == business_id, BusinessService.id == identifier))

    def list(self, business_id: str, *, active: bool | None = None) -> list[BusinessService]:
        query = select(BusinessService).where(BusinessService.business_id == business_id)
        if active is not None:
            query = query.where(BusinessService.active == active)
        return list(self.session.scalars(query.order_by(BusinessService.created_at, BusinessService.id)))

    def update(self, service: BusinessService, **changes) -> BusinessService:
        allowed = {"name", "description", "duration_minutes", "price", "active"}
        if set(changes) - allowed:
            raise ValueError("Unsupported service fields")
        for field, value in changes.items():
            if field == "name":
                if not isinstance(value, str) or not value.strip():
                    raise ValueError("Name is required")
                value = value.strip()
            if field == "duration_minutes" and (not isinstance(value, int) or value <= 0):
                raise ValueError("Duration must be positive")
            setattr(service, field, value)
        self.session.flush()
        return service


class AppointmentRepository(Repository[Appointment]):
    model = Appointment

    def create(self, *, business_id: str, service_id: str | None, service_name: str, staff_user_id: str | None,
               customer_name: str, starts_at: datetime, ends_at: datetime, created_by_id: str | None,
               customer_phone: str | None = None, customer_email: str | None = None, status: str = "scheduled",
               price=None, notes: str | None = None) -> Appointment:
        if not customer_name.strip() or ends_at <= starts_at or status not in APPOINTMENT_STATUSES:
            raise ValueError("Customer, a valid period and a known status are required")
        return self.add(Appointment(business_id=business_id, service_id=service_id, service_name=service_name,
                                    staff_user_id=staff_user_id, customer_name=customer_name.strip(),
                                    customer_phone=customer_phone, customer_email=customer_email,
                                    starts_at=starts_at, ends_at=ends_at, status=status, price=price, notes=notes,
                                    created_by_id=created_by_id))

    def in_business(self, business_id: str, identifier: str) -> Appointment | None:
        return self.session.scalar(select(Appointment).where(
            Appointment.business_id == business_id, Appointment.id == identifier))

    def list(self, business_id: str, *, starts_from: datetime | None = None, starts_until: datetime | None = None,
             status: str | None = None, staff_user_id: str | None = None, customer: str | None = None,
             limit: int = 50, offset: int = 0) -> list[Appointment]:
        pagination(limit, offset)
        query = select(Appointment).where(Appointment.business_id == business_id)
        if starts_from is not None:
            query = query.where(Appointment.starts_at >= starts_from)
        if starts_until is not None:
            query = query.where(Appointment.starts_at < starts_until)
        if status is not None:
            query = query.where(Appointment.status == status)
        if staff_user_id is not None:
            query = query.where(Appointment.staff_user_id == staff_user_id)
        if customer:
            query = query.where(Appointment.customer_name.icontains(customer, autoescape=True))
        return list(self.session.scalars(query.order_by(Appointment.starts_at, Appointment.id).limit(limit).offset(offset)))

    def staff_conflict(self, business_id: str, staff_user_id: str, starts_at: datetime, ends_at: datetime,
                       exclude_id: str | None = None) -> Appointment | None:
        """An active appointment of the same professional that overlaps the period."""
        query = select(Appointment).where(
            Appointment.business_id == business_id, Appointment.staff_user_id == staff_user_id,
            Appointment.status.in_(sorted(ACTIVE_STATUSES)),
            Appointment.starts_at < ends_at, Appointment.ends_at > starts_at)
        if exclude_id:
            query = query.where(Appointment.id != exclude_id)
        return self.session.scalar(query.order_by(Appointment.starts_at).limit(1))

    def update(self, appointment: Appointment, **changes) -> Appointment:
        allowed = {"service_id", "service_name", "staff_user_id", "customer_name", "customer_phone", "customer_email",
                   "starts_at", "ends_at", "status", "price", "notes"}
        if set(changes) - allowed:
            raise ValueError("Unsupported appointment fields")
        for field, value in changes.items():
            if field == "customer_name":
                if not isinstance(value, str) or not value.strip():
                    raise ValueError("Customer name is required")
                value = value.strip()
            if field == "status" and value not in APPOINTMENT_STATUSES:
                raise ValueError("Unknown status")
            setattr(appointment, field, value)
        if appointment.ends_at <= appointment.starts_at:
            raise ValueError("Appointment must end after it starts")
        self.session.flush()
        return appointment

    def overview(self, business_id: str, now: datetime) -> dict:
        """Counts for the home screen of a business, in two queries."""
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        week_end = day_start + timedelta(days=7)
        active = Appointment.status.in_(sorted(ACTIVE_STATUSES))
        totals = self.session.execute(select(
            func.count(Appointment.id).filter(and_(active, Appointment.starts_at >= day_start, Appointment.starts_at < day_end)),
            func.count(Appointment.id).filter(and_(active, Appointment.starts_at >= day_start, Appointment.starts_at < week_end)),
            func.count(Appointment.id).filter(and_(active, Appointment.starts_at >= now)),
            func.count(Appointment.id).filter(or_(Appointment.status == "done", Appointment.status == "cancelled",
                                                  Appointment.status == "no_show")),
        ).where(Appointment.business_id == business_id)).one()
        by_status = {status: int(count) for status, count in self.session.execute(
            select(Appointment.status, func.count()).where(Appointment.business_id == business_id)
            .group_by(Appointment.status))}
        return {"today": int(totals[0] or 0), "next_7_days": int(totals[1] or 0), "upcoming": int(totals[2] or 0),
                "finished": int(totals[3] or 0),
                "by_status": {status: by_status.get(status, 0) for status in APPOINTMENT_STATUSES}}
