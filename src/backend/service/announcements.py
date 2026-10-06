from uuid import uuid4

from backend.repository.cache.queries import snapshot
from backend.service.access import AccessDenied, authorize


class AnnouncementPermissionError(ValueError):
    pass


class AnnouncementService:
    def __init__(self, repositories, cached_repositories, messages):
        self.repositories, self.cached_repositories, self.messages = repositories, cached_repositories, messages

    @staticmethod
    def _authorize(repos, actor):
        current = authorize(repos, actor, approved=True)
        if current.role != "admin":
            raise AnnouncementPermissionError("Administrator access required")
        return current

    def list_for_user(self, actor, *, limit=50, offset=0, kind="announcement"):
        with self.cached_repositories.transaction() as repos:
            authorize(repos.db, actor, approved=True)
            return repos.notifications.list_for_recipient(actor.id, kind=kind, limit=limit, offset=offset)

    def mark_read(self, actor, identifier):
        with self.repositories.transaction() as repos:
            current = authorize(repos, actor, approved=True)
            note = repos.notifications.get(identifier)
            if note is None or note.recipient_id != current.id or note.kind != "announcement":
                raise KeyError("Announcement not found")
            repos.notifications.mark_read(note)
            return snapshot("notifications", note)

    def create(self, actor, *, title: str, body: str):
        with self.repositories.transaction() as repos:
            current = self._authorize(repos, actor)
            recipients = []
            offset = 0
            while True:
                page = repos.users.list(status="approved", limit=100, offset=offset)
                recipients.extend(page)
                if len(page) < 100:
                    break
                offset += 100
            announcement_id = str(uuid4())
            notes = [repos.notifications.create_announcement(
                announcement_id=announcement_id, recipient_id=user.id,
                creator_id=current.id, title=title, body=body) for user in recipients]
        queued = 0
        for user in recipients:
            try:
                if self.messages.announcement(user, title, body):
                    queued += 1
            except Exception:
                # DB delivery is durable; an SMTP outage must not roll back the notice.
                continue
        created_at = min((note.created_at for note in notes), default=None)
        return {"id": announcement_id, "title": title, "body": body,
                "recipients": len(notes), "email_queued": queued, "created_at": created_at}
