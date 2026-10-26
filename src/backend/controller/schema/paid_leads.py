import re
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StrictBool, field_validator, model_validator

from backend.domain.paid_leads import PaidLeadStage
from backend.domain.phones import brazilian_phone

_SOURCE = re.compile(r"[a-z0-9_.-]{1,30}")
_CLICK_ID = re.compile(r"[A-Za-z0-9_-]{1,200}")
_PLACEMENT = re.compile(r"[a-z0-9_-]{1,30}")


class PublicVisitInput(BaseModel):
    """Sent by a landing page when someone arrives from an ad."""
    model_config = ConfigDict(extra="forbid")
    page: Literal["contabilidade"]
    origin: str | None = Field(default=None, max_length=30)
    click_id: str | None = Field(default=None, max_length=200)

    @field_validator("origin")
    @classmethod
    def plain_origin(cls, value):
        return value if value and _SOURCE.fullmatch(value) else None

    @field_validator("click_id")
    @classmethod
    def plain_click_id(cls, value):
        return value if value and _CLICK_ID.fullmatch(value) else None


class PublicClickInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    placement: str = Field(max_length=30)

    @field_validator("placement")
    @classmethod
    def plain_placement(cls, value):
        return value if _PLACEMENT.fullmatch(value) else "unknown"


class PaidLeadOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    stage: PaidLeadStage
    source: str
    click_id: str | None
    page: str
    placement: str | None
    whatsapp_clicked_at: datetime | None
    name: str | None
    phone: str | None
    email: str | None
    notes: str | None
    contract_value: Decimal | None
    created_at: datetime
    updated_at: datetime


class PaidLeadPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    stage: PaidLeadStage | None = None
    name: str | None = Field(default=None, max_length=160)
    phone: str | None = Field(default=None, max_length=30)
    email: EmailStr | None = None
    notes: str | None = Field(default=None, max_length=10000)
    contract_value: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)

    @field_validator("name", "notes", mode="before")
    @classmethod
    def blank_is_empty(cls, value):
        return (value.strip() or None) if isinstance(value, str) else value

    @field_validator("phone", mode="before")
    @classmethod
    def clean_phone(cls, value):
        if value is None or (isinstance(value, str) and not value.strip()):
            return None
        phone = brazilian_phone(value) if isinstance(value, str) and re.fullmatch(r"[+0-9 ()-]+", value) else None
        if phone is None:
            raise ValueError("Invalid phone number")
        return phone

    @field_validator("email", mode="before")
    @classmethod
    def blank_email(cls, value):
        return (value.strip() or None) if isinstance(value, str) else value

    @model_validator(mode="after")
    def valid_patch(self):
        if not self.model_fields_set:
            raise ValueError("At least one field is required")
        if "stage" in self.model_fields_set and self.stage is None:
            raise ValueError("stage cannot be null")
        return self
