from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from backend.controller.schema.auth import ProfileInput, UserOutput


class MemberDirectoryOutput(BaseModel):
    has_photo: bool = False
    id: str
    name: str
    role: Literal["member", "admin"]


class MemberOutput(UserOutput):
    is_principal: bool = False


class MemberUpdateInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=1, max_length=120)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, min_length=10, max_length=30)
    role: Literal["member", "admin"] | None = None

    @field_validator("name")
    @classmethod
    def name_valid(cls, value):
        return ProfileInput.clean_name(value) if value is not None else value

    @field_validator("phone")
    @classmethod
    def phone_valid(cls, value):
        return ProfileInput.clean_phone(value) if value is not None else value

    @model_validator(mode="after")
    def meaningful_changes(self):
        if not self.model_fields_set or any(getattr(self, field) is None for field in self.model_fields_set - {"phone"}):
            raise ValueError("Provide valid member fields")
        return self
