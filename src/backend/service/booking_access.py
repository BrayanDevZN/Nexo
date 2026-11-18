"""Who may use the Atendimentos: the Nexo team's approval, access links with a time limit, and the list of every account.

A person who signs up alone waits ("pending") until the owner of Nexo approves. A person who signs up through an access link
the owner sent is approved on the spot, for the time the link says or with no end. When the permission ends, or the owner
removes it, the person keeps the account (and can sign in to read why) but cannot use any business. Every change is announced
live to the person and to the Nexo panel, and an approval is e-mailed.
"""
import logging
import secrets
import threading
from datetime import timedelta

from backend.repository.db.models.base import utc_now
from backend.service.access import ResourceConflict, ResourceNotFound
from backend.service.scheduling_auth import access_state

logger = logging.getLogger(__name__)
LINK_VALID_DAYS = 14
ROLE_RANK = {"owner": 3, "manager": 2, "staff": 1, "viewer": 0}
ROLE_LABELS = {"owner": "Dono", "manager": "Gerente", "staff": "Atendente", "viewer": "Só leitura"}


class AccessLinkError(ValueError):
    """The link does not exist, ran out of uses or is past its date."""


class BookingAccessService:
    def __init__(self, repositories, settings, scheduling, messages=None):
        self.repositories, self.settings, self.scheduling, self.messages = repositories, settings, scheduling, messages

    # Links -------------------------------------------------------------------------------------------------

    def url(self, token):
        return self.settings.frontend_url.rstrip("/") + "/atendimentos?access=" + token

    @staticmethod
    def _link(row):
        now = utc_now()
        return {"id": row.id, "note": row.note, "access_days": row.access_days, "max_uses": row.max_uses, "uses": row.uses,
                "expires_at": row.expires_at, "created_at": row.created_at,
                "active": row.uses < row.max_uses and row.expires_at > now}

    def create_link(self, admin, *, note=None, access_days=None, max_uses=1, valid_days=LINK_VALID_DAYS):
        token = secrets.token_urlsafe(32)
        with self.repositories.transaction() as repos:
            row = repos.booking_access_links.create(token=token, note=note, access_days=access_days, max_uses=max_uses,
                                                    expires_at=utc_now() + timedelta(days=valid_days), created_by_id=admin.id)
            result = self._link(row)
        self._admin_changed()
        # The address is shown once, when the link is made: only its hash is kept.
        return {**result, "url": self.url(token)}

    def list_links(self, admin):
        with self.repositories.read_transaction() as repos:
            return [self._link(row) for row in repos.booking_access_links.list()]

    def delete_link(self, admin, link_id):
        with self.repositories.transaction() as repos:
            row = repos.booking_access_links.get(link_id)
            if row is None:
                raise ResourceNotFound("Link not found")
            repos.booking_access_links.delete_link(row)
        self._admin_changed()

    def inspect_link(self, token):
        """What the person sees before signing up: how long the access will last. No session required."""
        with self.repositories.read_transaction() as repos:
            link = repos.booking_access_links.by_token(token)
            if link is None or link.uses >= link.max_uses or link.expires_at <= utc_now():
                raise AccessLinkError("Link not found or expired")
            return {"access_days": link.access_days}

    def redeem(self, user_id, token):
        """Give an account the permission of a link (once per use). Accounts the team removed stay removed."""
        with self.repositories.transaction() as repos:
            link = repos.booking_access_links.by_token(token)
            now = utc_now()
            if link is None or link.uses >= link.max_uses or link.expires_at <= now:
                raise AccessLinkError("Link not found or expired")
            user = repos.booking_users.get(user_id)
            if user is None:
                raise ResourceNotFound("Account not found")
            if user.access_status == "rejected":
                raise ResourceConflict("This account's access was removed by the team")
            if access_state(user) == "approved" and user.access_expires_at is None:
                return user   # already has an open-ended permission: nothing to spend
            if not repos.booking_access_links.consume(link, now):
                raise AccessLinkError("Link not found or expired")
            expires = now + timedelta(days=link.access_days) if link.access_days else None
            repos.booking_users.set_access(user, status="approved", expires_at=expires, source="link")
        self.scheduling.announce_access(user_id)
        return user

    # Accounts ----------------------------------------------------------------------------------------------

    def _row(self, user, roles, now):
        owned = roles.get(user.id, [])
        best = max(owned, key=lambda item: ROLE_RANK[item[1]], default=None)
        return {"id": user.id, "name": user.name, "email": user.email, "phone": user.phone, "has_photo": bool(user.profile_photo),
                "status": access_state(user, now), "access_expires_at": user.access_expires_at, "access_source": user.access_source,
                "role": best[1] if best else None, "role_label": ROLE_LABELS[best[1]] if best else None,
                "businesses": [{"name": name, "role": role} for name, role in owned], "created_at": user.created_at}

    def list_users(self, admin, *, status=None, query=None, limit=50, offset=0):
        now = utc_now()
        with self.repositories.read_transaction() as repos:
            rows = repos.booking_users.list_access(status=status, query=query, now=now, limit=limit, offset=offset)
            roles = repos.booking_users.business_roles(row.id for row in rows)
            return {"counts": repos.booking_users.counts_by_status(now), "users": [self._row(row, roles, now) for row in rows]}

    def photo(self, admin, user_id):
        with self.repositories.read_transaction() as repos:
            user = repos.booking_users.get(user_id)
            if user is None or user.profile_photo_data is None:
                raise ResourceNotFound("Photo not found")
            return user.profile_photo_data

    def decide(self, admin, user_id, *, decision, days=None):
        """approved (for `days` days, or with no end), rejected (removes the access) or pending (puts it back in the queue)."""
        if decision not in ("approved", "rejected", "pending"):
            raise ValueError("Unknown decision")
        with self.repositories.transaction() as repos:
            user = repos.booking_users.get(user_id)
            if user is None:
                raise ResourceNotFound("Account not found")
            was = access_state(user)
            expires = utc_now() + timedelta(days=days) if decision == "approved" and days else None
            repos.booking_users.set_access(user, status=decision, expires_at=expires, source="approval" if decision == "approved" else user.access_source)
            granted = decision == "approved" and was != "approved"
            name, email, until = user.name, user.email, expires
            snapshot_user = type("Person", (), {"name": name, "email": email})()
        self.scheduling.announce_access(user_id)
        if granted and self.messages is not None:
            threading.Thread(target=self._mail, args=(snapshot_user, until), daemon=True).start()
        with self.repositories.read_transaction() as repos:
            now = utc_now()
            row = repos.booking_users.get(user_id)
            return self._row(row, repos.booking_users.business_roles([user_id]), now)

    def delete_user(self, admin, user_id):
        """The Nexo owner removes an account for good; the businesses it owns go with it."""
        with self.repositories.transaction() as repos:
            user = repos.booking_users.get(user_id)
            if user is None:
                raise ResourceNotFound("Account not found")
            repos.booking_users.delete_account(user)
        self._admin_changed()

    def _mail(self, user, until):
        try:
            self.messages.booking_access_granted(user, until)
        except Exception:
            logger.warning("Booking access e-mail could not be sent", exc_info=True)

    def _admin_changed(self):
        try:
            if self.scheduling.events is not None:
                self.scheduling.events.publish({"type": "booking.access.changed"})
        except Exception:
            logger.warning("Realtime event unavailable; access change committed")
