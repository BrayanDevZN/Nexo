from sqlalchemy import delete, select, update

from backend.repository.db.control.base import Repository, pagination
from backend.repository.db.models import Automation


class AutomationRepository(Repository[Automation]):
    model = Automation

    def create(self, *, name, description, filename, file_content, image_data, created_by_id):
        return self.add(Automation(name=name, description=description, filename=filename,
                                   file_size=len(file_content), file_content=file_content,
                                   image_data=image_data, created_by_id=created_by_id))

    def get(self, identifier):
        return self.session.get(Automation, identifier)

    def update(self, automation, *, name, description, filename=None, file_content=None,
               image_data=None, replace_image=False, remove_image=False):
        automation.name = name
        automation.description = description
        if file_content is not None:
            automation.filename = filename
            automation.file_content = file_content
            automation.file_size = len(file_content)
        if replace_image:
            automation.image_data = image_data
        elif remove_image:
            automation.image_data = None
        self.session.flush()
        return automation

    def delete(self, automation):
        self.session.delete(automation)
        self.session.flush()

    def list(self, *, limit=50, offset=0):
        pagination(limit, offset)
        query = select(
            Automation.id, Automation.name, Automation.description, Automation.filename,
            Automation.file_size, Automation.created_by_id, Automation.created_at,
            Automation.updated_at, Automation.image_data.is_not(None).label("has_image"),
        ).order_by(Automation.created_at.desc(), Automation.id.desc()).limit(limit).offset(offset)
        return [dict(row._mapping) for row in self.session.execute(query)]

    def transfer_creator(self, previous_id, owner_id):
        result = self.session.execute(update(Automation).where(Automation.created_by_id == previous_id)
                                      .values(created_by_id=owner_id), execution_options={"synchronize_session": False})
        if result.rowcount:
            self.session.info.setdefault("cache_dirty_tables", set()).add("automations")
