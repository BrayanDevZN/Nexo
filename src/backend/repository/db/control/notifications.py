from sqlalchemy import select

from backend.repository.db.control.base import Repository, pagination
from backend.repository.db.models import Notification
from backend.repository.db.models.base import utc_now


class NotificationRepository(Repository[Notification]):
    model = Notification

    def create_approval_request(self, *, recipient_id: str,
                                requested_user_id: str) -> Notification:
        return self.add(Notification(recipient_id=recipient_id,
                                     requested_user_id=requested_user_id))

    def list_for_recipient(self, recipient_id: str, *, unresolved_only: bool = False,
                           limit: int = 50, offset: int = 0) -> list[Notification]:
        pagination(limit, offset)
        query = select(Notification).where(Notification.recipient_id == recipient_id)
        if unresolved_only:
            query = query.where(Notification.resolved_at.is_(None))
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
