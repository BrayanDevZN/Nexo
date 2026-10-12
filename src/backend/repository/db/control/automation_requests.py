from sqlalchemy import select

from backend.repository.db.control.base import Repository, pagination
from backend.repository.db.models import AutomationRequest, User


class AutomationRequestRepository(Repository[AutomationRequest]):
    model = AutomationRequest

    def create(self, *, user: User, details: str | None):
        return self.add(AutomationRequest(
            requested_by_id=user.id,
            active_requester_id=user.id,
            details=details,
        ))

    def pending_for_user(self, user_id: str):
        return self.session.scalar(select(AutomationRequest).where(
            AutomationRequest.active_requester_id == user_id,
        ))

    def list(self, *, requester_id: str | None = None, limit: int = 50, offset: int = 0):
        pagination(limit, offset)
        query = select(AutomationRequest, User.name, User.email).join(
            User, User.id == AutomationRequest.requested_by_id,
        )
        if requester_id is not None:
            query = query.where(AutomationRequest.requested_by_id == requester_id)
        rows = self.session.execute(query.order_by(
            AutomationRequest.created_at.desc(), AutomationRequest.id.desc(),
        ).limit(limit).offset(offset))
        return [
            {
                "id": item.id,
                "requested_by_id": item.requested_by_id,
                "requester_name": name,
                "requester_email": email,
                "details": item.details,
                "status": item.status,
                "invite_url": item.invite_url,
                "admin_message": item.admin_message,
                "reviewed_by_id": item.reviewed_by_id,
                "resolved_at": item.resolved_at,
                "created_at": item.created_at,
                "updated_at": item.updated_at,
            }
            for item, name, email in rows
        ]
