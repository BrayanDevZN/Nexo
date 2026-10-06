from backend.repository.cache.queries import snapshot
from backend.service.access import authorize_read


class ApprovalPermissionError(ValueError):
    pass


class ApprovalNotFound(ValueError):
    pass


class ApprovalConflict(ValueError):
    pass


class ApprovalService:
    def __init__(self, repositories, cached_repositories):
        self.repositories, self.cached_repositories = repositories, cached_repositories

    @staticmethod
    def notify_registration(repos, user):
        admin = repos.users.principal_admin()
        if admin and admin.status == "approved" and user.role == "member" and user.status == "pending":
            repos.notifications.ensure_approval_request(recipient_id=admin.id,
                                                        requested_user_id=user.id)
            # Approved members also receive a realtime notification about the new signup.
            member_ids = repos.users.approved_member_ids()
            # Keeps the notification helper tolerant of lightweight test
            # doubles while production repositories always return a list.
            recipients = [identifier for identifier in member_ids if identifier != user.id] if isinstance(member_ids, list) else []
            repos.notifications.create_member_joined_many(
                recipient_ids=recipients, member_id=user.id, member_name=user.name,
            )

    def synchronize_pending(self):
        # Also covers accounts created in development before admin credentials were set.
        with self.repositories.transaction() as repos:
            if repos.users.principal_admin() is None:
                return
            offset = 0
            while True:
                users = repos.users.list(status="pending", limit=100, offset=offset)
                for user in users:
                    self.notify_registration(repos, user)
                if len(users) < 100:
                    break
                offset += 100

    @staticmethod
    def _authorize(repos, actor):
        # Revalidate authoritative SQL state inside the operation's transaction.
        current = repos.users.get(actor.id)
        if (current is None or current.status != "approved" or current.role != "admin"
                or current.session_version != actor.session_version):
            raise ApprovalPermissionError("Administrator access required")

    @staticmethod
    def _authorize_read(repos, actor):
        current = authorize_read(repos, actor, approved=True)
        if current.role != "admin":
            raise ApprovalPermissionError("Administrator access required")
        return current

    def users(self, actor, **filters):
        with self.cached_repositories.read_transaction() as repos:
            self._authorize_read(repos.db, actor)
            return repos.users.list(**filters)

    def notifications(self, actor, **filters):
        with self.cached_repositories.read_transaction() as repos:
            self._authorize_read(repos.db, actor)
            return repos.notifications.list_for_recipient(actor.id, kind="approval_request", **filters)

    @staticmethod
    def _notification(repos, actor, identifier):
        notification = repos.notifications.get(identifier)
        if notification is None or notification.recipient_id != actor.id:
            raise ApprovalNotFound("Notification not found")
        return notification

    def mark_read(self, actor, identifier):
        with self.repositories.transaction() as repos:
            self._authorize(repos, actor)
            notification = self._notification(repos, actor, identifier)
            repos.notifications.mark_read(notification)
            return snapshot("notifications", notification)

    def decide(self, actor, identifier, decision):
        if decision not in {"approved", "rejected"}:
            raise ValueError("Invalid decision")
        with self.repositories.transaction() as repos:
            self._authorize(repos, actor)
            notification = self._notification(repos, actor, identifier)
            if (notification.kind != "approval_request"
                    or not repos.notifications.resolve_if_pending(notification, decision)):
                raise ApprovalConflict("Approval request already resolved")
            user = repos.users.get(notification.requested_user_id)
            if user is None or user.role != "member" or not repos.users.decide_pending(user, decision):
                raise ApprovalConflict("Account is no longer awaiting approval")
            return user
