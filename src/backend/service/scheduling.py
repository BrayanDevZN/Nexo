"""Businesses, their teams, services and appointments. Reads go through the cache; writes invalidate it per business."""
import json
import logging
import secrets
import threading
from decimal import Decimal
from types import SimpleNamespace
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
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
DEFAULT_MINUTES = 30   # an appointment with no service and no end
INVITATION_TTL = timedelta(days=7)


class SchedulingService:
    def __init__(self, repositories, cache, settings, messages=None, events=None, push=None):
        self.repositories, self.cache, self.settings, self.messages = repositories, cache, settings, messages
        self.events, self.push = events, push   # real-time channel and Web Push; both optional

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
        # By link: no e-mail given, the inviter shares the URL. By e-mail: it is sent here, and the URL stays available as a backup.
        sent = bool(email and self.messages and self.messages.booking_invitation(
            email, business_name=business_name, role_label=ROLE_LABELS[role], inviter_name=inviter, url=url))
        return {**result, "url": url, "email_sent": sent}

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


    # Real time ---------------------------------------------------------------------------------------------

    @staticmethod
    def channel_of(business_id):
        return "biz:" + business_id

    def realtime_ticket(self, actor, business_id, origin, expires_at):
        """A ticket for the socket of one business, only for a member of it."""
        with self.repositories.read_transaction() as repos:
            user, _ = self._member(repos, actor, business_id)
            self._needs_account(user)
            version = user.session_version
        return self.events.issue_booking_ticket(user.id, business_id, version, expires_at, origin)

    def realtime_access(self, payload):
        """Is the person of this ticket still signed in and still a member? Checked when the socket opens and every few seconds."""
        with self.repositories.read_transaction() as repos:
            user = repos.booking_users.get(payload["id"])
            if user is None or user.session_version != payload["session_version"]:
                raise AccessDenied("Access denied")
            if repos.businesses.membership(payload["business_id"], user.id) is None:
                raise AccessDenied("Access denied")
            return user

    def _announce(self, action, business_id, appointment, info):
        """Tell everyone looking at the business that an appointment changed, and push new bookings to the others."""
        try:
            if self.events is not None:
                self.events.publish({"type": "appointment.changed", "action": action, "business_id": business_id,
                                     "appointment_id": appointment["id"], "customer_name": appointment["customer_name"],
                                     "service_name": appointment["service_name"], "starts_at": (lambda text: text if text.endswith("Z") else text + "Z")(
                                         appointment["starts_at"].isoformat() if hasattr(appointment["starts_at"], "isoformat") else str(appointment["starts_at"])),
                                     "status": appointment.get("status"), "by_id": info["actor_id"],
                                     "by_name": info["actor_name"], "business_name": info["name"]},
                                    user_ids=[self.channel_of(business_id)])
        except Exception:
            logger.warning("Realtime event unavailable; appointment change committed")
        if action != "created" or self.push is None or not getattr(self.push, "enabled", False):
            return
        recipients = [user_id for user_id in info["members"] if user_id != info["actor_id"]]
        if not recipients:
            return
        starts = appointment["starts_at"]
        try:
            if isinstance(starts, str):
                starts = datetime.fromisoformat(starts.rstrip("Z"))
            local = starts.replace(tzinfo=ZoneInfo("UTC")).astimezone(ZoneInfo(info["timezone"]))
            when = local.strftime("%d/%m às %H:%M")
        except Exception:
            when = ""
        who = info["actor_name"] or "Alguém"
        body = f"{who} marcou {appointment['customer_name']}" + (f" · {when}" if when else "")
        # The title is the business, never the platform: it is what the person sees on the lock screen.
        threading.Thread(target=self.push.notify_users, daemon=True,
                         args=(recipients, info["name"], body, "/atendimentos"),
                         kwargs={"tag": "appointment-" + appointment["id"]}).start()

    def _announcement_info(self, repos, business_id, user):
        business = repos.businesses.get(business_id)
        return {"name": business.name, "timezone": business.timezone, "actor_id": user.id, "actor_name": user.name,
                "members": [member.user_id for member in repos.businesses.members(business_id)]}

    # Appointments ------------------------------------------------------------------------------------------

    @staticmethod
    def _with_people(repos, rows):
        """Name and photo marker of who attends and who booked; both are optional, an appointment may have neither."""
        people = repos.booking_users.summaries_by_ids([row["staff_user_id"] for row in rows] + [row["created_by_id"] for row in rows])

        def who(user_id):
            return people.get(user_id, {}) if user_id else {}
        return [{**row, "service_ids": json.loads(row["service_ids"]) if row.get("service_ids") else ([row["service_id"]] if row["service_id"] else []),
                 "staff_name": who(row["staff_user_id"]).get("name"), "staff_has_photo": bool(who(row["staff_user_id"]).get("has_photo")),
                 "created_by_name": who(row["created_by_id"]).get("name"), "created_by_has_photo": bool(who(row["created_by_id"]).get("has_photo"))}
                for row in rows]

    def performance(self, actor, business_id, *, period=None, date=None, starts_from=None, starts_until=None,
                    week_starts="sunday"):
        """What each person did in a period: appointments attended by status, revenue of the finished ones, and how many they booked."""
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
            query = {"operation": "performance", "from": starts_from.isoformat() if starts_from else None,
                     "until": starts_until.isoformat() if starts_until else None}

            def load():
                members = [snapshot("business_members", row) for row in repos.businesses.members(business_id)]
                handled, created = repos.appointments.performance(business_id, starts_from=starts_from, starts_until=starts_until)
                ids = [m["user_id"] for m in members] + [uid for uid, *_ in handled if uid] + [uid for uid, _ in created if uid]
                people = repos.booking_users.summaries_by_ids(ids)
                roles = {m["user_id"]: m["role"] for m in members}
                rows = {}

                def row(user_id):
                    if user_id not in rows:
                        info = people.get(user_id, {}) if user_id else {}
                        name = info.get("name") or ("Conta removida" if user_id else "Sem responsável")
                        rows[user_id] = {"user_id": user_id, "name": name, "role": roles.get(user_id), "has_photo": bool(info.get("has_photo")),
                                         "total": 0, "active": 0, "done": 0, "cancelled": 0, "no_show": 0, "revenue": 0.0, "created": 0}
                    return rows[user_id]
                for member in members:
                    row(member["user_id"])
                for user_id, status, count, revenue in handled:
                    item = row(user_id)
                    item["total"] += int(count)
                    item["active" if status in ACTIVE_STATUSES else status] += int(count)
                    if status == "done":
                        item["revenue"] += float(revenue or 0)
                for user_id, count in created:
                    if user_id:
                        row(user_id)["created"] += int(count)
                ordered = sorted(rows.values(), key=lambda r: (-r["done"], -r["total"], r["name"].lower()))
                return {"starts_from": starts_from.isoformat() if starts_from else None, "starts_until": starts_until.isoformat() if starts_until else None, "total": sum(r["total"] for r in ordered),
                        "done": sum(r["done"] for r in ordered), "revenue": round(sum(r["revenue"] for r in ordered), 2), "rows": ordered}
            return self.cache.read(self._scoped("appointments", business_id), query, load)

    def list_appointments(self, actor, business_id, *, starts_from=None, starts_until=None, status=None,
                          staff_user_id=None, customer=None, limit=50, offset=0, period=None, date=None,
                          week_starts="sunday", ends_after=None):
        if period and (starts_from or starts_until):
            raise ValueError("Use either a period or starts_from/starts_until, not both")
        if date and period not in ANCHORED_PERIODS:
            raise ValueError("date only applies to the day, week and month periods")
        starts_from = to_utc(starts_from) if starts_from else None
        starts_until = to_utc(starts_until) if starts_until else None
        ends_after = to_utc(ends_after) if ends_after else None
        with self.repositories.read_transaction() as repos:
            self._member(repos, actor, business_id)
            if period:
                business = repos.businesses.get(business_id)
                starts_from, starts_until = period_range(period, anchor=date, timezone=business.timezone,
                                                         week_starts=week_starts)
            query = {"operation": "list", "from": starts_from.isoformat() if starts_from else None,
                     "until": starts_until.isoformat() if starts_until else None, "status": status,
                     "staff_user_id": staff_user_id, "customer": customer, "limit": limit, "offset": offset,
                     "ends_after": ends_after.isoformat() if ends_after else None}
            return self.cache.read(self._scoped("appointments", business_id), query, lambda: self._with_people(
                repos, [snapshot("appointments", row) for row in repos.appointments.list(
                    business_id, starts_from=starts_from, starts_until=starts_until, status=status,
                    staff_user_id=staff_user_id, customer=customer, limit=limit, offset=offset,
                    ends_after=ends_after)]))

    def get_appointment(self, actor, business_id, appointment_id):
        with self.repositories.read_transaction() as repos:
            self._member(repos, actor, business_id)
            row = self.cache.read(self._scoped("appointments", business_id), {"operation": "get", "id": appointment_id},
                                  lambda: snapshot("appointments", repos.appointments.in_business(business_id, appointment_id)))
            if row is None:
                raise ResourceNotFound("Appointment not found")
            return self._with_people(repos, [row])[0]

    def _resolve_period(self, repos, business_id, *, service_ids, service_name, starts_at, ends_at, price,
                        staff_user_id, exclude_id=None, check_staff=True):
        """Fill in the services, the end and the price, check the professional belongs to the team and the slot is free.

        With services, the end is the start plus the sum of their durations and the price is the sum of theirs; both can
        be given instead. Without services the appointment is a plain "Atendimento" of 30 minutes. Nothing here is required.
        """
        services = []
        for service_id in dict.fromkeys(service_ids or []):
            service = repos.business_services.in_business(business_id, service_id)
            if service is None or not service.active:
                raise ResourceNotFound("Service not found")
            services.append(service)
        if services:
            service_name = service_name or " + ".join(service.name for service in services)[:160]
            if ends_at is None:
                ends_at = starts_at + timedelta(minutes=sum(service.duration_minutes for service in services))
            priced = [service.price for service in services if service.price is not None]
            if price is None and priced:
                price = sum((Decimal(str(value)) for value in priced), Decimal("0"))
        else:
            service_name = service_name or "Atendimento"
            if ends_at is None:
                ends_at = starts_at + timedelta(minutes=DEFAULT_MINUTES)
        if ends_at <= starts_at:
            raise ValueError("Appointment must end after it starts")
        if staff_user_id:
            if repos.businesses.membership(business_id, staff_user_id) is None:
                raise ResourceNotFound("Professional is not a member of this business")
            if check_staff:
                conflict = repos.appointments.staff_conflict(business_id, staff_user_id, starts_at, ends_at, exclude_id)
                if conflict is not None:
                    raise ResourceConflict("The professional already has an appointment in this period")
        return {"service_id": services[0].id if len(services) == 1 else None,
                "service_ids": json.dumps([service.id for service in services]) if services else None,
                "service_name": service_name, "starts_at": starts_at, "ends_at": ends_at, "price": price,
                "staff_user_id": staff_user_id}

    def create_appointment(self, actor, business_id, *, service_id=None, service_ids=None, service_name=None,
                           starts_at=None, ends_at=None, price=None, staff_user_id=None, **fields):
        starts_at = to_utc(starts_at) if starts_at else utc_now().replace(second=0, microsecond=0)
        ends_at = to_utc(ends_at) if ends_at else None
        ids = list(service_ids or []) or ([service_id] if service_id else [])
        with self.repositories.transaction() as repos:
            user, _ = self._member(repos, actor, business_id, "appointments.write")
            period = self._resolve_period(repos, business_id, service_ids=ids, service_name=service_name,
                                          starts_at=starts_at, ends_at=ends_at, price=price, staff_user_id=staff_user_id)
            row = repos.appointments.create(business_id=business_id, created_by_id=user.id, **period, **fields)
            result = self._with_people(repos, [snapshot("appointments", row)])[0]
            info = self._announcement_info(repos, business_id, user)
        self._announce("created", business_id, result, info)
        return result

    @staticmethod
    def _service_ids_of(appointment):
        if appointment.service_ids:
            return json.loads(appointment.service_ids)
        return [appointment.service_id] if appointment.service_id else []

    def update_appointment(self, actor, business_id, appointment_id, **changes):
        with self.repositories.transaction() as repos:
            user, _ = self._member(repos, actor, business_id, "appointments.write")
            appointment = repos.appointments.in_business(business_id, appointment_id)
            if appointment is None:
                raise ResourceNotFound("Appointment not found")
            for field in ("starts_at", "ends_at"):
                if changes.get(field) is not None:
                    changes[field] = to_utc(changes[field])
            # Choosing other services (one or several) recomputes the end and the price, unless they are given too.
            new_ids = None
            if "service_ids" in changes:
                new_ids = list(changes.pop("service_ids") or [])
                changes.pop("service_id", None)
            elif "service_id" in changes:
                new_ids = [changes.pop("service_id")] if changes.get("service_id") else []
                changes.pop("service_id", None)
            timing = {"service_name", "starts_at", "ends_at", "price", "staff_user_id"}
            if new_ids is not None or timing & set(changes) or changes.get("status") in ACTIVE_STATUSES:
                # A moved or reassigned appointment is checked like a new one, against the other active ones.
                starts_at = changes.get("starts_at", appointment.starts_at)
                ends_at = changes.get("ends_at")
                if ends_at is None and new_ids is None:
                    ends_at = (starts_at + (appointment.ends_at - appointment.starts_at)) if "starts_at" in changes else appointment.ends_at
                price = changes["price"] if "price" in changes else (None if new_ids is not None else appointment.price)
                period = self._resolve_period(
                    repos, business_id, service_ids=new_ids if new_ids is not None else self._service_ids_of(appointment),
                    service_name=changes.get("service_name", appointment.service_name if new_ids is None else None),
                    starts_at=starts_at, ends_at=ends_at, price=price,
                    staff_user_id=changes.get("staff_user_id", appointment.staff_user_id), exclude_id=appointment.id,
                    check_staff=changes.get("status", appointment.status) in ACTIVE_STATUSES)
                changes.update(period)
            row = repos.appointments.update(appointment, **changes)
            result = self._with_people(repos, [snapshot("appointments", row)])[0]
            info = self._announcement_info(repos, business_id, user)
        self._announce("updated", business_id, result, info)
        return result

    def delete_appointment(self, actor, business_id, appointment_id):
        with self.repositories.transaction() as repos:
            user, _ = self._member(repos, actor, business_id, "appointments.delete")
            appointment = repos.appointments.in_business(business_id, appointment_id)
            if appointment is None:
                raise ResourceNotFound("Appointment not found")
            gone = snapshot("appointments", appointment)
            info = self._announcement_info(repos, business_id, user)
            repos.appointments.delete(appointment_id)
        self._announce("deleted", business_id, gone, info)
