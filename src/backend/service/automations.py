import logging
from uuid import uuid4

from backend.repository.cache.queries import snapshot
from backend.service.access import AccessDenied, ResourceNotFound, authorize, authorize_read

logger = logging.getLogger(__name__)


class AutomationService:
    def __init__(self, repositories, cached_repositories, push=None, image_storage=None):
        self.repositories = repositories
        self.cached_repositories = cached_repositories
        self.push = push
        self.image_storage = image_storage

    @staticmethod
    def _can_manage(actor, automation):
        return actor.role == "owner" or automation.created_by_id == actor.id

    def list(self, actor, *, limit=50, offset=0):
        with self.cached_repositories.read_transaction() as repos:
            current = authorize_read(repos.db, actor, approved=True)
            rows = repos.db.automations.list(limit=limit, offset=offset)
            creators = repos.db.users.profile_summaries_by_ids(row["created_by_id"] for row in rows)
            return [{**row, "created_by_name": creators.get(row["created_by_id"], {}).get("name", "Membro removido"),
                     "can_manage": current.role == "owner" or row["created_by_id"] == current.id}
                    for row in rows]

    def _notify(self, repos, current, recipients, *, title, body, image_data):
        image_key = None
        if recipients and image_data:
            if self.image_storage is None:
                raise RuntimeError("Automation notice image storage is unavailable")
            image_key = self.image_storage.write(image_data)
        try:
            repos.notifications.create_automation_announcements(
                announcement_id=str(uuid4()), recipient_ids=[user.id for user in recipients],
                creator_id=current.id, title=title, body=body, image_storage_key=image_key,
            )
        except BaseException:
            if image_key and self.image_storage:
                try:
                    self.image_storage.delete(image_key)
                except OSError:
                    pass
            raise

    def _push_notice(self, recipients, title, body):
        if self.push and recipients:
            try:
                self.push.notify_users([user.id for user in recipients], title, body)
            except Exception:
                logger.warning("Automation push notification could not be delivered", exc_info=True)

    def create(self, actor, *, name, description, filename, file_content, image_data=None):
        with self.repositories.transaction() as repos:
            current = authorize(repos, actor, approved=True)
            row = repos.automations.create(name=name, description=description, filename=filename,
                                            file_content=file_content, image_data=image_data,
                                            created_by_id=current.id)
            recipients = repos.users.approved_recipients()
            body = f"{description}\n\nArquivo: {filename}"
            self._notify(repos, current, recipients, title=f"Nova automação disponível: {name}",
                         body=body, image_data=image_data)
            result = {**snapshot("automations", row), "created_by_name": current.name,
                      "has_image": bool(image_data), "can_manage": True}
        self._push_notice(recipients, f"Nova automação: {name}", description)
        return result

    def update(self, actor, identifier, *, name, description, filename=None, file_content=None,
               image_data=None, replace_image=False, remove_image=False):
        with self.repositories.transaction() as repos:
            current = authorize(repos, actor, approved=True)
            row = repos.automations.get(identifier)
            if row is None:
                raise ResourceNotFound("Automation not found")
            if not self._can_manage(current, row):
                raise AccessDenied("Only the automation creator or an owner can manage it")
            row = repos.automations.update(row, name=name, description=description,
                                           filename=filename, file_content=file_content,
                                           image_data=image_data, replace_image=replace_image,
                                           remove_image=remove_image)
            recipients = repos.users.approved_recipients()
            body = f"A automação \"{name}\" foi atualizada.\n\n{description}\n\nArquivo: {row.filename}"
            self._notify(repos, current, recipients, title=f"Automação atualizada: {name}",
                         body=body, image_data=row.image_data)
            result = {**snapshot("automations", row), "created_by_name": current.name,
                      "has_image": bool(row.image_data), "can_manage": True}
        self._push_notice(recipients, f"Automação atualizada: {name}", body)
        return result

    def delete(self, actor, identifier):
        with self.repositories.transaction() as repos:
            current = authorize(repos, actor, approved=True)
            row = repos.automations.get(identifier)
            if row is None:
                raise ResourceNotFound("Automation not found")
            if not self._can_manage(current, row):
                raise AccessDenied("Only the automation creator or an owner can manage it")
            name, description, image_data = row.name, row.description, row.image_data
            recipients = repos.users.approved_recipients()
            self._notify(repos, current, recipients, title=f"Automação excluída: {name}",
                         body=f"A automação \"{name}\" foi excluída da biblioteca.\n\n{description}",
                         image_data=image_data)
            repos.automations.delete(row)
        body = f"A automação \"{name}\" foi excluída da biblioteca.\n\n{description}"
        self._push_notice(recipients, f"Automação excluída: {name}", body)
        return {"id": identifier, "deleted": True}

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
