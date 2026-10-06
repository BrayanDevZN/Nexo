from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ApprovalInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: Literal["approved", "rejected"]


class AnnouncementInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=160)
    body: str = Field(min_length=1, max_length=5000)

    @field_validator("title", "body")
    @classmethod
    def clean_text(cls, value: str) -> str:
        value = value.strip()
        if not value or "\x00" in value:
            raise ValueError("Aviso não pode ficar vazio ou conter caracteres inválidos")
        return value


class AnnouncementOutput(BaseModel):
    id: str
    title: str
    body: str
    recipients: int
    email_queued: int
    created_at: datetime


class NotificationOutput(BaseModel):
    id: str
    kind: str
    announcement_id: str | None = None
    title: str | None = None
    body: str | None = None
    recipient_id: str
    requested_user_id: str
    read_at: datetime | None
    resolved_at: datetime | None
    decision: Literal["approved", "rejected"] | None
    created_at: datetime
    updated_at: datetime
