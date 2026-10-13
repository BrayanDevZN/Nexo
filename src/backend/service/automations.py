import logging
from uuid import uuid4

from backend.repository.cache.queries import snapshot
from backend.service.access import ResourceNotFound, authorize, authorize_read

logger = logging.getLogger(__name__)


class AutomationService:
    def __init__(self, repositories, cached_repositories, push=None):
        self.repositories = repositories
        self.cached_repositories = cached_repositories
        self.push = push

    def list(self, actor, *, limit=50, offset=0):
        with self.cached_repositories.read_transaction() as repos:
            authorize_read(repos.db, actor, approved=True)
            rows = repos.db.automations.list(limit=limit, offset=offset)
            creators = repos.db.users.profile_summaries_by_ids(row["created_by_id"] for row in rows)
            return [{**row, "created_by_name": creators.get(row["created_by_id"], {}).get("name", "Membro removido")}
                    for row in rows]

    def get(self, actor, identifier):
        with self.cached_repositories.read_transaction() as repos:
            authorize_read(repos.db, actor, approved=True)
            row = repos.db.automations.get_summary(identifier)
            if row is None:
                raise ResourceNotFound("Automation not found")
            creator = repos.db.users.profile_summaries_by_ids([row["created_by_id"]]).get(row["created_by_id"])
            return {**row, "created_by_name": creator.get("name", "Membro removido") if creator else "Membro removido"}

    def create(self, actor, *, name, description, filename, file_content, image_data=None):
        with self.repositories.transaction() as repos:
            current = authorize(repos, actor, approved=True)
            row = repos.automations.create(name=name, description=description, filename=filename,
                                            file_content=file_content, image_data=image_data,
                                            created_by_id=current.id)
            recipients = repos.users.approved_recipients()
            repos.notifications.create_announcements(
                announcement_id=str(uuid4()), recipient_ids=[user.id for user in recipients],
                creator_id=current.id, title=f"Nova automação disponível: {name}",
                body=f"{description}\n\nArquivo: {filename}",
            )
            recipients_ids = [user.id for user in recipients]
            result = {**snapshot("automations", row), "created_by_name": current.name,
                      "has_image": bool(image_data)}
        if self.push:
            try:
                self.push.notify_users(recipients_ids, f"Nova automação: {name}", description)
            except Exception:
                logger.warning("Automation push notification could not be delivered", exc_info=True)
        return result

    def download(self, actor, identifier):
        with self.repositories.read_transaction() as repos:
            authorize_read(repos, actor, approved=True)
            row = repos.automations.get(identifier)
            if row is None:
                raise ResourceNotFound("Automation not found")
            return row.filename, row.file_content

    def image(self, actor, identifier):
        with self.repositories.read_transaction() as repos:
            authorize_read(repos, actor, approved=True)
            row = repos.automations.get(identifier)
            if row is None or row.image_data is None:
                raise ResourceNotFound("Automation image not found")
            return row.image_data
