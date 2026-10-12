from datetime import datetime
from typing import Literal

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, field_validator


class AutomationRequestCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    details: str | None = Field(default=None, max_length=2000)

    @field_validator("details")
    @classmethod
    def clean_details(cls, value):
        if value is None:
            return None
        value = value.strip()
        if "\x00" in value:
            raise ValueError("O texto contém caracteres inválidos")
        return value or None


class AutomationInviteInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    invite_url: AnyHttpUrl
    message: str = Field(default="", max_length=3000)

    @field_validator("message")
    @classmethod
    def clean_message(cls, value):
        value = value.strip()
        if "\x00" in value:
            raise ValueError("A mensagem contém caracteres inválidos")
        return value


class AutomationRejectInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(default="", max_length=1000)

    @field_validator("message")
    @classmethod
    def clean_message(cls, value):
        value = value.strip()
        if "\x00" in value:
            raise ValueError("A mensagem contém caracteres inválidos")
        return value


class AutomationRequestOutput(BaseModel):
    id: str
    requested_by_id: str
    requester_name: str
    requester_email: str
    details: str | None
    status: Literal["pending", "invited", "rejected"]
    invite_url: str | None
    admin_message: str | None
    reviewed_by_id: str | None
    resolved_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AutomationRequestCreated(BaseModel):
    id: str
    status: Literal["pending", "invited", "rejected"]
    details: str | None
    created_at: datetime
    updated_at: datetime


class AutomationRequestDecision(BaseModel):
    id: str
    status: Literal["invited", "rejected"]
    invite_url: str | None = None
    resolved_at: datetime | None
    updated_at: datetime
