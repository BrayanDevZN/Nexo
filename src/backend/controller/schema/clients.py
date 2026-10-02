from datetime import datetime

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    StrictBool,
    field_validator,
    model_validator,
)

from backend.controller.schema.auth import ProfileInput


class ClientFields(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=160)
    niche: str = Field(min_length=1, max_length=120)
    contract_closed: StrictBool = False
    phone: str | None = Field(default=None, max_length=30)
    email: EmailStr | None = None
    notes: str | None = Field(default=None, max_length=10000)

    @field_validator("name", "niche")
    @classmethod
    def trim_required(cls, value):
        if not value.strip():
            raise ValueError("Field cannot be blank")
        return value.strip()

    @field_validator("phone")
    @classmethod
    def clean_phone(cls, value):
        return ProfileInput.clean_phone(value) if value is not None else None


class ClientPatch(ClientFields):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    niche: str | None = Field(default=None, min_length=1, max_length=120)
    contract_closed: StrictBool | None = None

    @field_validator("name", "niche")
    @classmethod
    def trim_required(cls, value):
        if value is None or not value.strip():
            raise ValueError("Field cannot be null or blank")
        return value.strip()

    @model_validator(mode="after")
    def valid_patch(self):
        if not self.model_fields_set:
            raise ValueError("At least one field is required")
        if "contract_closed" in self.model_fields_set and self.contract_closed is None:
            raise ValueError("contract_closed cannot be null")
        return self


class ClientOutput(ClientFields):
    model_config = ConfigDict(from_attributes=True)
    id: str
    created_by_id: str
    created_at: datetime
    updated_at: datetime
