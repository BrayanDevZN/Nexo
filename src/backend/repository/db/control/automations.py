from sqlalchemy import delete, func, select, update

from backend.repository.db.control.base import Repository, pagination
from backend.repository.db.models import Automation, AutomationMedia


class AutomationRepository(Repository[Automation]):
    model = Automation

    def create(self, *, name, description, filename, file_content, image_data, created_by_id):
        return self.add(Automation(name=name, description=description, filename=filename,
                                   file_size=len(file_content), file_content=file_content,
                                   image_data=image_data, created_by_id=created_by_id))

    def update(self, identifier, *, name=None, description=None, filename=None,
               file_content=None, image_data=None, clear_image=False):
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
        elif clear_image:
            row.image_data = None
        self.session.flush()
        self.session.info.setdefault("cache_dirty_tables", set()).add("automations")
        return row

    def add_media(self, automation_id, *, kind, content_type, filename, data):
        position = self.session.execute(select(func.count()).select_from(AutomationMedia)
                                        .where(AutomationMedia.automation_id == automation_id)).scalar_one()
        row = AutomationMedia(automation_id=automation_id, position=position, kind=kind, content_type=content_type,
                              filename=filename, size=len(data), data=data)
        self.session.add(row)
        self.session.flush()
        self.session.info.setdefault("cache_dirty_tables", set()).add("automations")
        return row

    def media_count(self, automation_id):
        return self.session.execute(select(func.count()).select_from(AutomationMedia)
                                    .where(AutomationMedia.automation_id == automation_id)).scalar_one()

    def delete_media(self, automation_id, media_ids):
        result = self.session.execute(delete(AutomationMedia).where(
            AutomationMedia.automation_id == automation_id, AutomationMedia.id.in_(list(media_ids))))
        self.session.info.setdefault("cache_dirty_tables", set()).add("automations")
        return result.rowcount

    def get_media(self, automation_id, media_id):
        return self.session.execute(select(AutomationMedia).where(
            AutomationMedia.automation_id == automation_id, AutomationMedia.id == media_id)).scalar_one_or_none()

    def first_image(self, automation_id):
        return self.session.execute(select(AutomationMedia.data).where(
            AutomationMedia.automation_id == automation_id, AutomationMedia.kind == "image")
            .order_by(AutomationMedia.position, AutomationMedia.created_at).limit(1)).scalar_one_or_none()

    def media_for(self, automation_ids):
        ids = list(automation_ids)
        result = {identifier: [] for identifier in ids}
        if not ids:
            return result
        query = select(AutomationMedia.id, AutomationMedia.automation_id, AutomationMedia.kind,
                       AutomationMedia.content_type, AutomationMedia.filename, AutomationMedia.size
                       ).where(AutomationMedia.automation_id.in_(ids)).order_by(
            AutomationMedia.position, AutomationMedia.created_at)
        for row in self.session.execute(query).mappings():
            result[row["automation_id"]].append({key: row[key] for key in ("id", "kind", "content_type", "filename", "size")})
        return result

    def delete(self, identifier):
        self.session.execute(delete(AutomationMedia).where(AutomationMedia.automation_id == identifier))
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
