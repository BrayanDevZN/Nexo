from uuid import uuid4

from sqlalchemy import delete, exists, insert, literal, or_, select, update

from backend.repository.db.control.base import Repository, pagination
from backend.repository.db.models import Notification
from backend.repository.db.models.base import utc_now


class NotificationRepository(Repository[Notification]):
    model = Notification

    def create_approval_request(self, *, recipient_id: str,
                                requested_user_id: str) -> Notification:
        return self.add(Notification(recipient_id=recipient_id,
                                     requested_user_id=requested_user_id))

    def create_announcement(self, *, announcement_id: str, recipient_id: str,
                            creator_id: str, title: str, body: str) -> Notification:
        return self.add(Notification(kind="announcement", announcement_id=announcement_id,
                                     title=title, body=body, recipient_id=recipient_id,
                                     requested_user_id=creator_id))

    def create_member_joined(self, *, recipient_id: str, member_id: str,
                             member_name: str) -> Notification:
        return self.add(Notification(kind="member_joined", title="Novo membro na equipe",
                                     body=f"{member_name} criou uma conta e aguarda aprovação.",
                                     recipient_id=recipient_id, requested_user_id=member_id))

    def create_announcements(self, *, announcement_id: str, recipient_ids,
                             creator_id: str, title: str, body: str) -> list[Notification]:
        rows = [Notification(kind="announcement", announcement_id=announcement_id,
                             title=title, body=body, recipient_id=identifier,
                             requested_user_id=creator_id) for identifier in recipient_ids]
        if rows:
            self.session.add_all(rows)
            self.session.flush()
        return rows

    def create_member_joined_many(self, *, recipient_ids, member_id: str,
                                   member_name: str) -> list[Notification]:
        rows = [Notification(kind="member_joined", title="Novo membro na equipe",
                             body=f"{member_name} criou uma conta e aguarda aprovação.",
                             recipient_id=identifier, requested_user_id=member_id)
                for identifier in recipient_ids]
        if rows:
            self.session.add_all(rows)
            self.session.flush()
        return rows

    def list_for_recipient(self, recipient_id: str, *, unresolved_only: bool = False,
                           kind: str | None = None, limit: int = 50, offset: int = 0) -> list[Notification]:
        pagination(limit, offset)
        query = select(Notification).where(Notification.recipient_id == recipient_id)
        if unresolved_only:
            query = query.where(Notification.resolved_at.is_(None))
        if kind is not None:
            query = query.where(Notification.kind == kind)
        return list(self.session.scalars(query.order_by(Notification.created_at, Notification.id)
                                        .limit(limit).offset(offset)))

    def resolve(self, notification: Notification, decision: str) -> None:
        if decision not in {"approved", "rejected"}:
            raise ValueError("Invalid decision")
        if notification.resolved_at is not None:
            raise ValueError("Notification already resolved")
        notification.decision = decision
        notification.resolved_at = utc_now()
        notification.read_at = notification.read_at or notification.resolved_at
        self.session.flush()


    def ensure_approval_request(self, *, recipient_id: str, requested_user_id: str) -> bool:
        # One INSERT SELECT makes the absence check atomic under SQLite's write lock.
        missing = ~exists(select(Notification.id).where(
            Notification.recipient_id == recipient_id,
            Notification.requested_user_id == requested_user_id,
            Notification.kind == "approval_request", Notification.resolved_at.is_(None)))
        now = utc_now()
        values = select(literal(str(uuid4())), literal(now), literal(now),
                        literal("approval_request"), literal(recipient_id),
                        literal(requested_user_id)).where(missing)
        result = self.session.execute(insert(Notification).from_select(
            ["id", "created_at", "updated_at", "kind", "recipient_id", "requested_user_id"], values))
        if result.rowcount:
            self.session.info.setdefault("cache_dirty_tables", set()).add("notifications")
        return result.rowcount == 1

    def mark_read(self, notification: Notification) -> None:
        # Conditional update preserves the first read timestamp across concurrent requests.
        self.session.execute(update(Notification).where(
            Notification.id == notification.id, Notification.read_at.is_(None)
        ).values(read_at=utc_now()), execution_options={"synchronize_session": False})
        self.session.info.setdefault("cache_dirty_tables", set()).add("notifications")
        self.session.refresh(notification)

    def resolve_if_pending(self, notification: Notification, decision: str) -> bool:
        if decision not in {"approved", "rejected"}:
            raise ValueError("Invalid decision")
        from sqlalchemy import func
        now = utc_now()
        result = self.session.execute(update(Notification).where(
            Notification.id == notification.id, Notification.resolved_at.is_(None)
        ).values(decision=decision, resolved_at=now,
                 read_at=func.coalesce(Notification.read_at, now)),
            execution_options={"synchronize_session": False})
        self.session.info.setdefault("cache_dirty_tables", set()).add("notifications")
        self.session.refresh(notification)
        return result.rowcount == 1

    def delete_for_user(self, identifier):
        result = self.session.execute(delete(Notification).where(or_(
            Notification.recipient_id == identifier, Notification.requested_user_id == identifier
        )), execution_options={"synchronize_session": False})
        if result.rowcount:
            self.session.info.setdefault("cache_dirty_tables", set()).add("notifications")
