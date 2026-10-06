from sqlalchemy import func, select, update
from sqlalchemy.orm import load_only

from backend.repository.db.control.base import Repository, pagination
from backend.repository.db.models import Document


class DocumentRepository(Repository[Document]):
    model = Document

    def create(self, *, filename, storage_key, content, size, created_by_id):
        return self.add(Document(filename=filename, storage_key=storage_key, content=content,
                                 size=size, created_by_id=created_by_id))

    def list(self, *, limit=50, offset=0):
        pagination(limit, offset)
        # content is stored in SQLite for portable volumes but is only needed
        # by download.  Listing must not read every BLOB in the page.
        query = select(Document).options(load_only(
            Document.id, Document.filename, Document.size, Document.created_by_id,
            Document.created_at, Document.updated_at,
        )).order_by(Document.created_at.desc(), Document.id)
        return list(self.session.scalars(query.limit(limit).offset(offset)))

    def count(self) -> int:
        return int(self.session.scalar(select(func.count()).select_from(Document)) or 0)

    def transfer_creator(self, previous_id, owner_id):
        result = self.session.execute(update(Document).where(Document.created_by_id == previous_id)
                                      .values(created_by_id=owner_id), execution_options={"synchronize_session": False})
        if result.rowcount:
            self.session.info.setdefault("cache_dirty_tables", set()).add("documents")
