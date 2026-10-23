import logging
from uuid import uuid4

from backend.domain.roles import DEVELOPERS
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
    def _owner_id(repos):
        owner = repos.users.principal_admin()
        return owner.id if owner else None

    @staticmethod
    def _can_manage(actor, creator_id, owner_id):
        return actor.role in DEVELOPERS and (actor.id == creator_id or actor.id == owner_id)

    @staticmethod
    def _output(row, creator_name, can_manage):
        return {**row, "created_by_name": creator_name, "can_manage": can_manage}

    def list(self, actor, *, limit=50, offset=0):
        with self.cached_repositories.read_transaction() as repos:
            authorize_read(repos.db, actor, approved=True)
            rows = repos.db.automations.list(limit=limit, offset=offset)
            creators = repos.db.users.profile_summaries_by_ids(row["created_by_id"] for row in rows)
            owner_id = self._owner_id(repos.db)
            return [self._output(
                row, creators.get(row["created_by_id"], {}).get("name", "Membro removido"),
                self._can_manage(actor, row["created_by_id"], owner_id),
            ) for row in rows]

    def get(self, actor, identifier):
        with self.cached_repositories.read_transaction() as repos:
            authorize_read(repos.db, actor, approved=True)
            row = repos.db.automations.get_summary(identifier)
            if row is None:
                raise ResourceNotFound("Automation not found")
            creator = repos.db.users.profile_summaries_by_ids([row["created_by_id"]]).get(row["created_by_id"])
            name = creator.get("name", "Membro removido") if creator else "Membro removido"
            return self._output(row, name, self._can_manage(actor, row["created_by_id"], self._owner_id(repos.db)))

    def create(self, actor, *, name, description, filename, file_content, image_data=None):
        image_key = None
        try:
            with self.repositories.transaction() as repos:
                current = authorize(repos, actor, approved=True)
                if current.role not in DEVELOPERS:
                    raise AccessDenied("Developer access required")
                row = repos.automations.create(name=name, description=description, filename=filename,
                                               file_content=file_content, image_data=image_data,
                                               created_by_id=current.id)
                recipients = repos.users.approved_recipients("dev")
                if image_data and recipients and self.image_storage:
                    image_key = self.image_storage.write(image_data)
                repos.notifications.create_announcements(
                    announcement_id=str(uuid4()), recipient_ids=[user.id for user in recipients],
                    creator_id=current.id, title=f"Nova automação disponível: {name}",
                    body=f"{description}\n\nArquivo: {filename}", image_storage_key=image_key, audience="dev")
                recipients_ids = [user.id for user in recipients]
                result = {**snapshot("automations", row), "created_by_name": current.name,
                          "has_image": bool(image_data), "can_manage": True}
        except BaseException:
            if image_key and self.image_storage:
                try:
                    self.image_storage.delete(image_key)
                except OSError:
                    pass
            raise
        if self.push:
            try:
                self.push.notify_users(recipients_ids, f"Nova automação: {name}", description)
            except Exception:
                logger.warning("Automation push notification could not be delivered", exc_info=True)
        return result

    def update(self, actor, identifier, *, name=None, description=None, filename=None,
               file_content=None, image_data=None):
        image_key = None
        try:
            with self.repositories.transaction() as repos:
                current = authorize(repos, actor, approved=True)
                row = repos.automations.get(identifier)
                if row is None:
                    raise ResourceNotFound("Automation not found")
                if not self._can_manage(current, row.created_by_id, self._owner_id(repos)):
                    raise AccessDenied("Only the creator or owner can manage this automation")
                row = repos.automations.update(identifier, name=name, description=description,
                                               filename=filename, file_content=file_content,
                                               image_data=image_data)
                final_name = row.name
                final_description = row.description
                final_image = row.image_data
                recipients = repos.users.approved_recipients("dev")
                if final_image and recipients and self.image_storage:
                    image_key = self.image_storage.write(final_image)
                repos.notifications.create_announcements(
                    announcement_id=str(uuid4()), recipient_ids=[user.id for user in recipients],
                    creator_id=current.id, title=f"Automação atualizada: {final_name}",
                    body=f"A automação foi atualizada.\n\n{row.description}\n\nArquivo: {row.filename}",
                    image_storage_key=image_key, audience="dev")
                ids = [user.id for user in recipients]
                creator = repos.users.profile_summaries_by_ids([row.created_by_id]).get(row.created_by_id)
                result = {**snapshot("automations", row),
                          "created_by_name": creator["name"] if creator else "Membro removido",
                          "has_image": bool(row.image_data), "can_manage": True}
        except BaseException:
            if image_key and self.image_storage:
                try:
                    self.image_storage.delete(image_key)
                except OSError:
                    pass
            raise
        if self.push:
            try:
                self.push.notify_users(ids, f"Automação atualizada: {final_name}", final_description)
            except Exception:
                logger.warning("Automation push notification could not be delivered", exc_info=True)
        return result

    def delete(self, actor, identifier):
        image_key = None
        try:
            with self.repositories.transaction() as repos:
                current = authorize(repos, actor, approved=True)
                row = repos.automations.get(identifier)
                if row is None:
                    raise ResourceNotFound("Automation not found")
                if not self._can_manage(current, row.created_by_id, self._owner_id(repos)):
                    raise AccessDenied("Only the creator or owner can manage this automation")
                name, description, filename, image_data = row.name, row.description, row.filename, row.image_data
                recipients = repos.users.approved_recipients("dev")
                if image_data and recipients and self.image_storage:
                    image_key = self.image_storage.write(image_data)
                repos.notifications.create_announcements(
                    announcement_id=str(uuid4()), recipient_ids=[user.id for user in recipients],
                    creator_id=current.id, title=f"Automação excluída: {name}",
                    body=f"A automação foi removida da biblioteca.\n\n{description}\n\nArquivo: {filename}",
                    image_storage_key=image_key, audience="dev")
                repos.automations.delete(identifier)
                ids = [user.id for user in recipients]
        except BaseException:
            if image_key and self.image_storage:
                try:
                    self.image_storage.delete(image_key)
                except OSError:
                    pass
            raise
        if self.push:
            try:
                self.push.notify_users(ids, f"Automação excluída: {name}", description)
            except Exception:
                logger.warning("Automation push notification could not be delivered", exc_info=True)
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

