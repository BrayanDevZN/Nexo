from datetime import datetime

from pydantic import BaseModel


class AutomationMediaOutput(BaseModel):
    id: str
    kind: str
    content_type: str
    filename: str
    size: int


class AutomationOutput(BaseModel):
    id: str
    name: str
    description: str
    filename: str
    file_size: int
    created_by_id: str
    created_by_name: str
    has_image: bool
    can_manage: bool = False
    media: list[AutomationMediaOutput] = []
    created_at: datetime
    updated_at: datetime
