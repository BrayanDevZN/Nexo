import logging
from uuid import uuid4

from backend.domain.documents import validate_document
from backend.domain.roles import SALES
from backend.repository.cache.queries import snapshot
from backend.service.access import AccessDenied, ResourceNotFound, authorize_role
from backend.service.clients import ClientService

logger = logging.getLogger(__name__)


class DocumentService:
    def __init__(self, repositories, cached_repositories, storage, max_bytes):
        self.repositories, self.cached_repositories = repositories, cached_repositories
        self.storage, self.max_bytes = storage, max_bytes
        self.messages = None
        self.push = None

    def list(self, actor, **filters):
        with self.cached_repositories.read_transaction() as repos:
            authorize_role(repos.db, actor, SALES, read=True)
            return ClientService.with_creators(repos, repos.documents.list(**filters))

    def get(self, actor, identifier):
        with self.cached_repositories.read_transaction() as repos:
            authorize_role(repos.db, actor, SALES, read=True)
            row = repos.db.documents.get_summary(identifier)
            if row is None:
                raise ResourceNotFound("Document not found")
            creator = repos.db.users.profile_summaries_by_ids([row["created_by_id"]]).get(row["created_by_id"])
            return {**row, "created_by_name": creator.get("name", "Membro removido") if creator else "Membro removido"}

    def upload(self, actor, filename, data, client_id=None):
        with self.repositories.read_transaction() as repos:
            authorize_role(repos, actor, SALES, read=True)
        filename = validate_document(filename, data, self.max_bytes)
        key = self.storage.write(data)
        notice = None
        try:
            with self.repositories.transaction() as repos:
                user = authorize_role(repos, actor, SALES)
                client = repos.clients.get(client_id) if client_id else None
                if client_id and client is None:
                    raise ResourceNotFound("Client not found")
                row = repos.documents.create(filename=filename, storage_key=key,
                                             content=data, size=len(data), created_by_id=user.id, client_id=client_id)
                title = "Novo documento salvo"
                body = (f"{filename} foi salvo para o cliente {client.name}."
                        if client else f"{filename} foi salvo na biblioteca de documentos.")
                # Only the commercial team uploads documents, so they and the admins are told.
                recipients = repos.users.approved_recipients("commercial")
                repos.notifications.create_announcements(
                    announcement_id=str(uuid4()),
                    recipient_ids=[member.id for member in recipients],
                    creator_id=user.id,
                    title=title,
                    body=body,
                    audience="commercial",
                )
                notice = (recipients, title, body)
                result = {**snapshot("documents", row), "created_by_name": user.name}
        except BaseException:
            self.cleanup(key)
            raise
        if notice:
            self._deliver_team_notice(*notice)
        return result

    def _deliver_team_notice(self, recipients, title, body):
        if self.messages:
            for member in recipients:
                try:
                    self.messages.announcement(member, title, body)
                except Exception:
                    logger.warning("Document notice email could not be queued", exc_info=True)
        if self.push:
            try:
                self.push.notify_users([member.id for member in recipients], title, body)
            except Exception:
                logger.warning("Document notice push could not be delivered", exc_info=True)

    def download(self, actor, identifier):
        with self.repositories.read_transaction() as repos:
            authorize_role(repos, actor, SALES, read=True)
            row = repos.documents.get(identifier)
            if row is None:
                raise ResourceNotFound("Document not found")
            key, filename, content = row.storage_key, row.filename, row.content
        if content is not None:
            return filename, content
        try:
            return filename, self.storage.read(key)
        except FileNotFoundError:
            raise ResourceNotFound("Document not found") from None

    def delete(self, actor, identifier):
        with self.repositories.transaction() as repos:
            user = authorize_role(repos, actor, SALES)
            row = repos.documents.get(identifier)
            if row is None:
                raise ResourceNotFound("Document not found")
            if user.role not in {"owner", "admin"} and row.created_by_id != user.id:
                raise AccessDenied("Only the creator or an administrator can delete this document")
            key = row.storage_key
            repos.documents.delete(identifier)
        self.cleanup(key)

    def cleanup(self, key):
        try:
            self.storage.delete(key)
        except OSError:
            logger.warning("Document cleanup failed")

