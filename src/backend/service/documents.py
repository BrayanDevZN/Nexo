import logging
from uuid import uuid4

from backend.domain.documents import validate_document
from backend.repository.cache.queries import snapshot
from backend.service.access import AccessDenied, ResourceNotFound, authorize
from backend.service.clients import ClientService

logger = logging.getLogger(__name__)


class DocumentService:
    def __init__(self, repositories, cached_repositories, storage, max_bytes):
        self.repositories, self.cached_repositories = repositories, cached_repositories
        self.storage, self.max_bytes = storage, max_bytes

    def list(self, actor, **filters):
        with self.cached_repositories.transaction() as repos:
            authorize(repos.db, actor, approved=True)
            return [ClientService.with_creator(repos, row) for row in repos.documents.list(**filters)]

    def upload(self, actor, filename, data):
        with self.repositories.transaction() as repos:
            authorize(repos, actor, approved=True)
        filename = validate_document(filename, data, self.max_bytes)
        key = self.storage.write(data)
        try:
            with self.repositories.transaction() as repos:
                user = authorize(repos, actor, approved=True)
                row = repos.documents.create(filename=filename, storage_key=key,
                                             content=data, size=len(data), created_by_id=user.id)
                return {**snapshot("documents", row), "created_by_name": user.name}
        except BaseException:
            self.cleanup(key)
            raise

    def download(self, actor, identifier):
        with self.repositories.transaction() as repos:
            authorize(repos, actor, approved=True)
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
            user = authorize(repos, actor, approved=True)
            row = repos.documents.get(identifier)
            if row is None:
                raise ResourceNotFound("Document not found")
            if user.role != "admin" and row.created_by_id != user.id:
                raise AccessDenied("Only the creator or an administrator can delete this document")
            key, content = row.storage_key, row.content
            repos.documents.delete(identifier)
        self.cleanup(key)

    def cleanup(self, key):
        try:
            self.storage.delete(key)
        except OSError:
            logger.warning("Document cleanup failed")
