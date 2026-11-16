"""Businesses, their teams, services and appointments. Reads go through the cache; writes invalidate it per business."""
import logging
import secrets
from types import SimpleNamespace
from datetime import timedelta
from urllib.parse import urlencode

from sqlalchemy.exc import IntegrityError

from backend.domain.photos import normalize_photo
from backend.domain.scheduling import (
    ACTIVE_STATUSES,
    BUSINESS_OWNER,
    INVITABLE_ROLES,
    ANCHORED_PERIODS,
    allowed,
    outranks,
    period_range,
    slugify,
    to_utc,
)
from backend.repository.db.control.scheduling import snapshot
from backend.repository.db.models.base import utc_now
from backend.service.access import AccessDenied, ResourceConflict, ResourceNotFound
from backend.service.scheduling_auth import authorize_booking

logger = logging.getLogger(__name__)

PLATFORM_STAFF = "platform_staff"   # PlatformActor: an API key of the Nexo team, with no Atendimentos account

ROLE_LABELS = {"owner": "dono", "manager": "gerente", "staff": "atendente", "viewer": "leitura"}
MAX_BUSINESSES_PER_USER = 20
INVITATION_TTL = timedelta(days=7)


class SchedulingService:
    def __init__(self, repositories, cache, settings, messages=None):
        self.repositories, self.cache, self.settings, self.messages = repositories, cache, settings, messages

    # Authorization ----------------------------------------------------------------------------------------

    @staticmethod
    def _needs_account(user):
        """Some actions belong to a person (the owner of a new business, who invites, who joins): keys have none."""
        if getattr(user, PLATFORM_STAFF, False):
            raise AccessDenied("This action needs an Atendimentos account: do it in the Atendimentos app")

    @staticmethod
    def _member(repos, actor, business_id, permission=None):
        """The actor's membership in the business, read from SQL. A non-member sees 404, never that it exists."""
        user = authorize_booking(repos, actor)
        membership = repos.businesses.membership(business_id, user.id)
        if membership is None and getattr(actor, PLATFORM_STAFF, False) and repos.businesses.get(business_id) is not None:
            # The Nexo owner's and administrators' API keys reach every business, with the dono's permissions.
            membership = SimpleNamespace(role=BUSINESS_OWNER)
        if membership is None:
            raise ResourceNotFound("Business not found")
        if permission and not allowed(membership.role, permission):
            raise AccessDenied("Permission denied for this action")
        return user, membership

    def _scoped(self, table, business_id):
        return table + ":" + business_id

    # Businesses --------------------------------------------------------------------------------------------

    def list_businesses(self, actor):
        with self.repositories.read_transaction() as repos:
            user = authorize_booking(repos, actor)
            if getattr(actor, PLATFORM_STAFF, False):
                return self.cache.read("businesses", {"operation": "list_all"},
                                       lambda: [{**snapshot("businesses", business), "my_role": BUSINESS_OWNER}
                                                for business in repos.businesses.list_all()])
            return self.cache.read("businesses", {"operation": "list_for_user", "user_id": user.id},
                                   lambda: [{**snapshot("businesses", business), "my_role": role}
                                            for business, role in repos.businesses.list_for_user(user.id)])

    def get_business(self, actor, business_id):
        with self.repositories.read_transaction() as repos:
            _, membership = self._member(repos, actor, business_id)
            row = self.cache.read("businesses", {"operation": "get", "id": business_id},
                                  lambda: snapshot("businesses", repos.businesses.get(business_id)))
            if row is None:
                raise ResourceNotFound("Business not found")
            return {**row, "my_role": membership.role}

    @staticmethod
    def _ensure_unique(repos, name, cnpj, except_id=None):
        """No two businesses are the same: not by name (ignoring case, accents and spacing) and not by CNPJ."""
        if name and repos.businesses.name_taken(name, except_id=except_id):
            raise ResourceConflict("Já existe um negócio com esse nome")
        if cnpj and repos.businesses.cnpj_taken(cnpj, except_id=except_id):
            raise ResourceConflict("Já existe um negócio com esse CNPJ")

    def create_business(self, actor, *, name, opening_hours, **fields):
        with self.repositories.transaction() as repos:
            user = authorize_booking(repos, actor)
            self._needs_account(user)
            if len(repos.businesses.list_for_user(user.id)) >= MAX_BUSINESSES_PER_USER:
                raise ResourceConflict("Business limit reached for this account")
            self._ensure_unique(repos, name, fields.get("cnpj"))
            base = slugify(name)
            slug = base
            while repos.businesses.slug_taken(slug):
                slug = base[:52] + "-" + secrets.token_hex(3)
            row = repos.businesses.create(owner_id=user.id, name=name, slug=slug, opening_hours=opening_hours, **fields)
            return {**snapshot("businesses", row), "my_role": BUSINESS_OWNER}

    def update_business(self, actor, business_id, **changes):
        with self.repositories.transaction() as repos:
            _, membership = self._member(repos, actor, business_id, "business.write")
            self._ensure_unique(repos, changes.get("name"), changes.get("cnpj"), except_id=business_id)
            row = repos.businesses.update(repos.businesses.get(business_id), **changes)
            return {**snapshot("businesses", row), "my_role": membership.role}

    def upload_business_photo(self, actor, business_id, data):
        normalized = normalize_photo(data, max_bytes=self.settings.profile_photo_max_bytes,
                                     max_pixels=self.settings.profile_photo_max_pixels)
        with self.repositories.transaction() as repos:
            _, membership = self._member(repos, actor, business_id, "business.write")
            business = repos.businesses.get(business_id)
            repos.businesses.set_photo(business, normalized)
            return {**snapshot("businesses", business), "my_role": membership.role}

    def delete_business_photo(self, actor, business_id):
        with self.repositories.transaction() as repos:
            _, membership = self._member(repos, actor, business_id, "business.write")
            business = repos.businesses.get(business_id)
            repos.businesses.set_photo(business, None)
            return {**snapshot("businesses", business), "my_role": membership.role}

    def read_business_photo(self, actor, business_id):
        with self.repositories.read_transaction() as repos:
            self._member(repos, actor, business_id)
            business = repos.businesses.get(business_id)
            if business is None or business.photo_data is None:
                raise ResourceNotFound("Photo not found")
            return business.photo_data

    def delete_business(self, actor, business_id):
        with self.repositories.transaction() as repos:
            self._member(repos, actor, business_id, "business.delete")
            repos.businesses.delete_business(repos.businesses.get(business_id))

    def overview(self, actor, business_id):
        now = utc_now().replace(second=0, microsecond=0)
        with self.repositories.read_transaction() as repos:
            self._member(repos, actor, business_id)

            def load():
                counts = repos.appointments.overview(business_id, now)
                upcoming = repos.appointments.list(business_id, starts_from=now, limit=5)
                return {**counts, "next": self._with_people(repos, [snapshot("appointments", row) for row in upcoming
                                                                     if row.status in ACTIVE_STATUSES])}
            return self.cache.read(self._scoped("appointments", business_id),
                                   {"operation": "overview", "at": now.isoformat()}, load)

    # Members -----------------------------------------------------------------------------------------------

    def list_members(self, actor, business_id):
        with self.repositories.read_transaction() as repos:
            self._member(repos, actor, business_id)

            def load():
                rows = [snapshot("business_members", row) for row in repos.businesses.members(business_id)]
                people = repos.booking_users.summaries_by_ids(row["user_id"] for row in rows)
                return [{**row, "name": people.get(row["user_id"], {}).get("name", "Conta removida"),
                         "email": people.get(row["user_id"], {}).get("email"),
                         "has_photo": people.get(row["user_id"], {}).get("has_photo", False)} for row in rows]
            return self.cache.read(self._scoped("business_members", business_id), {"operation": "list"}, load)

    def set_member_role(self, actor, business_id, user_id, role):
        with self.repositories.transaction() as repos:
            _, membership = self._member(repos, actor, business_id, "members.manage")
            target = repos.businesses.membership(business_id, user_id)
            if target is None:
                raise ResourceNotFound("Member not found")
            if target.role == BUSINESS_OWNER or role not in INVITABLE_ROLES:
                raise AccessDenied("The owner's role cannot be changed")
            if not outranks(membership.role, target.role) or not outranks(membership.role, role):
                raise AccessDenied("You can only manage roles below your own")
            return snapshot("business_members", repos.businesses.set_role(target, role))

    def remove_member(self, actor, business_id, user_id):
        with self.repositories.transaction() as repos:
            user, membership = self._member(repos, actor, business_id)
            target = repos.businesses.membership(business_id, user_id)
            if target is None:
                raise ResourceNotFound("Member not found")
            if target.role == BUSINESS_OWNER:
                raise AccessDenied("The owner cannot leave or be removed; delete the business instead")
            if target.user_id != user.id:
                if not allowed(membership.role, "members.manage") or not outranks(membership.role, target.role):
                    raise AccessDenied("You can only remove members below your own role")
            repos.businesses.remove_member(target)

    # Invitations -------------------------------------------------------------------------------------------

    def invitation_url(self, token):
        return self.settings.frontend_url.rstrip("/") + "/atendimentos?" + urlencode({"invite": token})

    def create_invitation(self, actor, business_id, *, role, email=None):
        token = secrets.token_urlsafe(32)
        with self.repositories.transaction() as repos:
            user, membership = self._member(repos, actor, business_id, "members.manage")
            self._needs_account(user)
            if role not in INVITABLE_ROLES or not outranks(membership.role, role):
                raise AccessDenied("You can only invite roles below your own")
            business = repos.businesses.get(business_id)
            row = repos.businesses.create_invitation(business_id=business_id, email=email, role=role, token=token,
                                                     created_by_id=user.id, ttl=INVITATION_TTL)
            result = snapshot("business_invitations", row)
            business_name, inviter = business.name, user.name
        url = self.invitation_url(token)
        if email and self.messages:
            self.messages.booking_invitation(email, business_name=business_name, role_label=ROLE_LABELS[role],
                                             inviter_name=inviter, url=url)
        return {**result, "url": url}

    def list_invitations(self, actor, business_id):
        with self.repositories.read_transaction() as repos:
            self._member(repos, actor, business_id, "members.manage")
            return self.cache.read(self._scoped("business_invitations", business_id), {"operation": "pending"},
                                   lambda: [snapshot("business_invitations", row)
                                            for row in repos.businesses.pending_invitations(business_id)])

    def delete_invitation(self, actor, business_id, invitation_id):
        with self.repositories.transaction() as repos:
            self._member(repos, actor, business_id, "members.manage")
            invitation = repos.businesses.invitation(business_id, invitation_id)
            if invitation is None:
                raise ResourceNotFound("Invitation not found")
            repos.businesses.delete_invitation(invitation)

    def inspect_invitation(self, token):
        """What a visitor sees before accepting: the business and the role. No session required."""
        with self.repositories.read_transaction() as repos:
            invitation = repos.businesses.invitation_by_token(token)
            if invitation is None or invitation.accepted_at is not None or invitation.expires_at <= utc_now():
                raise ResourceNotFound("Invitation not found or expired")
            business = repos.businesses.get(invitation.business_id)
            return {"business_name": business.name, "role": invitation.role, "email": invitation.email,
                    "expires_at": invitation.expires_at.isoformat() + "Z"}

    def accept_invitation(self, actor, token):
        try:
            with self.repositories.transaction() as repos:
                user = authorize_booking(repos, actor)
                self._needs_account(user)
                invitation = repos.businesses.invitation_by_token(token)
                if invitation is None or invitation.accepted_at is not None or invitation.expires_at <= utc_now():
                    raise ResourceNotFound("Invitation not found or expired")
                if invitation.email and invitation.email != user.email:
                    raise AccessDenied("This invitation was sent to another e-mail address")
                if repos.businesses.membership(invitation.business_id, user.id):
                    raise ResourceConflict("You are already a member of this business")
                if not repos.businesses.accept_invitation(invitation, user.id):
                    raise ResourceNotFound("Invitation not found or expired")
                repos.businesses.add_member(invitation.business_id, user.id, invitation.role)
                business = repos.businesses.get(invitation.business_id)
                return {**snapshot("businesses", business), "my_role": invitation.role}
        except IntegrityError:
            raise ResourceConflict("You are already a member of this business") from None

    # Services ----------------------------------------------------------------------------------------------

    def list_services(self, actor, business_id, active=None):
        with self.repositories.read_transaction() as repos:
            self._member(repos, actor, business_id)
            return self.cache.read(self._scoped("business_services", business_id),
                                   {"operation": "list", "active": active},
                                   lambda: [snapshot("business_services", row)
                                            for row in repos.business_services.list(business_id, active=active)])

    def create_service(self, actor, business_id, **fields):
        with self.repositories.transaction() as repos:
            self._member(repos, actor, business_id, "services.write")
            return snapshot("business_services", repos.business_services.create(business_id=business_id, **fields))

    def update_service(self, actor, business_id, service_id, **changes):
        with self.repositories.transaction() as repos:
            self._member(repos, actor, business_id, "services.write")
            service = repos.business_services.in_business(business_id, service_id)
            if service is None:
                raise ResourceNotFound("Service not found")
            return snapshot("business_services", repos.business_services.update(service, **changes))

    def delete_service(self, actor, business_id, service_id):
        with self.repositories.transaction() as repos:
            self._member(repos, actor, business_id, "services.write")
            service = repos.business_services.in_business(business_id, service_id)
            if service is None:
                raise ResourceNotFound("Service not found")
            # Appointments keep service_name; the SET NULL on service_id is applied by SQLite. Tell the cache.
            dirty = repos.appointments.session.info.setdefault("cache_dirty_tables", set())
            dirty.update({"appointments", "appointments:" + business_id})
            repos.business_services.delete(service_id)

    # Appointments ------------------------------------------------------------------------------------------

    @staticmethod
    def _with_people(repos, rows):
        people = repos.booking_users.summaries_by_ids(row["staff_user_id"] for row in rows)
        return [{**row, "staff_name": people.get(row["staff_user_id"], {}).get("name") if row["staff_user_id"] else None}
                for row in rows]

    def list_appointments(self, actor, business_id, *, starts_from=None, starts_until=None, status=None,
                          staff_user_id=None, customer=None, limit=50, offset=0, period=None, date=None,
                          week_starts="sunday"):
        if period and (starts_from or starts_until):
            raise ValueError("Use either a period or starts_from/starts_until, not both")
        if date and period not in ANCHORED_PERIODS:
            raise ValueError("date only applies to the day, week and month periods")
        starts_from = to_utc(starts_from) if starts_from else None
        starts_until = to_utc(starts_until) if starts_until else None
        with self.repositories.read_transaction() as repos:
            self._member(repos, actor, business_id)
            if period:
                business = repos.businesses.get(business_id)
                starts_from, starts_until = period_range(period, anchor=date, timezone=business.timezone,
                                                         week_starts=week_starts)
            query = {"operation": "list", "from": starts_from.isoformat() if starts_from else None,
                     "until": starts_until.isoformat() if starts_until else None, "status": status,
                     "staff_user_id": staff_user_id, "customer": customer, "limit": limit, "offset": offset}
            return self.cache.read(self._scoped("appointments", business_id), query, lambda: self._with_people(
                repos, [snapshot("appointments", row) for row in repos.appointments.list(
                    business_id, starts_from=starts_from, starts_until=starts_until, status=status,
                    staff_user_id=staff_user_id, customer=customer, limit=limit, offset=offset)]))

    def get_appointment(self, actor, business_id, appointment_id):
        with self.repositories.read_transaction() as repos:
            self._member(repos, actor, business_id)
            row = self.cache.read(self._scoped("appointments", business_id), {"operation": "get", "id": appointment_id},
                                  lambda: snapshot("appointments", repos.appointments.in_business(business_id, appointment_id)))
            if row is None:
                raise ResourceNotFound("Appointment not found")
            return self._with_people(repos, [row])[0]

    def _resolve_period(self, repos, business_id, *, service_id, service_name, starts_at, ends_at, price,
                        staff_user_id, exclude_id=None):
        """Fill the service details, check the professional belongs to the team and that the slot is free."""
        service = None
        if service_id:
            service = repos.business_services.in_business(business_id, service_id)
            if service is None or not service.active:
                raise ResourceNotFound("Service not found")
            service_name = service_name or service.name
            if ends_at is None:
                ends_at = starts_at + timedelta(minutes=service.duration_minutes)
            if price is None:
                price = service.price
        if not service_name or ends_at is None:
            raise ValueError("A service, or a service name with an end time, is required")
        if ends_at <= starts_at:
            raise ValueError("Appointment must end after it starts")
        if staff_user_id:
            if repos.businesses.membership(business_id, staff_user_id) is None:
                raise ResourceNotFound("Professional is not a member of this business")
            conflict = repos.appointments.staff_conflict(business_id, staff_user_id, starts_at, ends_at, exclude_id)
            if conflict is not None:
                raise ResourceConflict("The professional already has an appointment in this period")
        return {"service_id": service.id if service else None, "service_name": service_name,
                "starts_at": starts_at, "ends_at": ends_at, "price": price, "staff_user_id": staff_user_id}

    def create_appointment(self, actor, business_id, *, service_id=None, service_name=None, starts_at, ends_at=None,
                           price=None, staff_user_id=None, **fields):
        starts_at = to_utc(starts_at)
        ends_at = to_utc(ends_at) if ends_at else None
        with self.repositories.transaction() as repos:
            user, _ = self._member(repos, actor, business_id, "appointments.write")
            period = self._resolve_period(repos, business_id, service_id=service_id, service_name=service_name,
                                          starts_at=starts_at, ends_at=ends_at, price=price, staff_user_id=staff_user_id)
            row = repos.appointments.create(business_id=business_id, created_by_id=user.id, **period, **fields)
            return self._with_people(repos, [snapshot("appointments", row)])[0]

    def update_appointment(self, actor, business_id, appointment_id, **changes):
        with self.repositories.transaction() as repos:
            self._member(repos, actor, business_id, "appointments.write")
            appointment = repos.appointments.in_business(business_id, appointment_id)
            if appointment is None:
                raise ResourceNotFound("Appointment not found")
            for field in ("starts_at", "ends_at"):
                if changes.get(field) is not None:
                    changes[field] = to_utc(changes[field])
            timing = {"service_id", "service_name", "starts_at", "ends_at", "price", "staff_user_id"}
            if timing & set(changes) or changes.get("status") in ACTIVE_STATUSES:
                # A moved or reassigned appointment is checked like a new one, against the other active ones.
                starts_at = changes.get("starts_at", appointment.starts_at)
                ends_at = changes.get("ends_at")
                if ends_at is None and "starts_at" in changes and "service_id" not in changes:
                    ends_at = starts_at + (appointment.ends_at - appointment.starts_at)
                elif ends_at is None and "service_id" not in changes:
                    ends_at = appointment.ends_at
                if changes.get("status", appointment.status) in ACTIVE_STATUSES:
                    period = self._resolve_period(
                        repos, business_id, service_id=changes.get("service_id", appointment.service_id),
                        service_name=changes.get("service_name", appointment.service_name if "service_id" not in changes else None),
                        starts_at=starts_at, ends_at=ends_at, price=changes.get("price", appointment.price),
                        staff_user_id=changes.get("staff_user_id", appointment.staff_user_id), exclude_id=appointment.id)
                    changes.update(period)
                elif ends_at is not None:
                    changes["ends_at"] = ends_at
            row = repos.appointments.update(appointment, **changes)
            return self._with_people(repos, [snapshot("appointments", row)])[0]

    def delete_appointment(self, actor, business_id, appointment_id):
        with self.repositories.transaction() as repos:
            self._member(repos, actor, business_id, "appointments.delete")
            appointment = repos.appointments.in_business(business_id, appointment_id)
            if appointment is None:
                raise ResourceNotFound("Appointment not found")
            repos.appointments.delete(appointment_id)
