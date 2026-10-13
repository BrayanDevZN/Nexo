from sqlalchemy import select, update

from backend.repository.db.control.base import Repository, pagination
from backend.repository.db.models import Automation


class AutomationRepository(Repository[Automation]):
    model = Automation

    def create(self, *, name, description, filename, file_content, image_data, created_by_id):
        return self.add(Automation(name=name, description=description, filename=filename,
                                   file_size=len(file_content), file_content=file_content,
                                   image_data=image_data, created_by_id=created_by_id))

    def update(self, identifier, *, name=None, description=None, filename=None,
               file_content=None, image_data=None):
        row = self.get(identifier)
        if row is None:
            return None
        if name is not None:
            row.name = name
        if description is not None:
            row.description = description
        if filename is not None and file_content is not None:
            row.filename = filename
            row.file_content = file_content
            row.file_size = len(file_content)
        if image_data is not None:
            row.image_data = image_data
        self.session.flush()
        self.session.info.setdefault("cache_dirty_tables", set()).add("automations")
        return row

    def delete(self, identifier):
        deleted = super().delete(identifier)
        if deleted:
            self.session.info.setdefault("cache_dirty_tables", set()).add("automations")
        return deleted

    def list(self, *, limit=50, offset=0):
        pagination(limit, offset)
        query = select(
            Automation.id, Automation.name, Automation.description, Automation.filename,
            Automation.file_size, Automation.created_by_id, Automation.created_at,
            Automation.updated_at, Automation.image_data.is_not(None).label("has_image"),
        ).order_by(Automation.created_at.desc(), Automation.id.desc()).limit(limit).offset(offset)
        return [dict(row._mapping) for row in self.session.execute(query)]

    def get_summary(self, identifier: str):
        query = select(
            Automation.id, Automation.name, Automation.description, Automation.filename,
            Automation.file_size, Automation.created_by_id, Automation.created_at,
            Automation.updated_at, Automation.image_data.is_not(None).label("has_image"),
        ).where(Automation.id == identifier)
        row = self.session.execute(query).mappings().first()
        return dict(row) if row is not None else None

    def transfer_creator(self, previous_id, owner_id):
        result = self.session.execute(update(Automation).where(Automation.created_by_id == previous_id)
                                      .values(created_by_id=owner_id), execution_options={"synchronize_session": False})
        if result.rowcount:
            self.session.info.setdefault("cache_dirty_tables", set()).add("automations")
