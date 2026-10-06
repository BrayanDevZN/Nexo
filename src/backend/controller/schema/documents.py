from datetime import datetime

from pydantic import BaseModel


class DocumentOutput(BaseModel):
    id: str
    filename: str
    size: int
    created_by_id: str
    created_by_name: str
    created_at: datetime
    updated_at: datetime
