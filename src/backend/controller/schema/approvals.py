from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class ApprovalInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: Literal["approved", "rejected"]


class NotificationOutput(BaseModel):
    id: str
    kind: str
    recipient_id: str
    requested_user_id: str
    read_at: datetime | None
    resolved_at: datetime | None
    decision: Literal["approved", "rejected"] | None
    created_at: datetime
    updated_at: datetime
