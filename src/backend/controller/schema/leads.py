import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from backend.domain.phones import brazilian_phone

_ORIGIN = re.compile(r"[a-z0-9_.-]{1,30}")
_CLICK_ID = re.compile(r"[A-Za-z0-9_-]{1,200}")


class PublicLeadInput(BaseModel):
    """What a landing page sends when a visitor asks to be contacted."""
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=2, max_length=160)
    phone: str = Field(max_length=30)
    email: EmailStr | None = None
    page: Literal["contabilidade"]
    consent: Literal[True]
    origin: str | None = Field(default=None, max_length=30)
    click_id: str | None = Field(default=None, max_length=200)
    # Hidden field that people never see; bots fill it in.
    website: str = Field(default="", max_length=200)

    @field_validator("name")
    @classmethod
    def trim_name(cls, value):
        value = " ".join(value.split())
        if len(value) < 2:
            raise ValueError("Name is too short")
        return value

    @field_validator("phone")
    @classmethod
    def clean_phone(cls, value):
        phone = brazilian_phone(value) if re.fullmatch(r"[+0-9 ()-]+", value) else None
        if phone is None:
            raise ValueError("Invalid phone number")
        return phone

    @field_validator("email", mode="before")
    @classmethod
    def blank_email_is_none(cls, value):
        return value.strip() or None if isinstance(value, str) else value

    @field_validator("origin")
    @classmethod
    def known_origin_shape(cls, value):
        return value if value and _ORIGIN.fullmatch(value) else None

    @field_validator("click_id")
    @classmethod
    def click_id_shape(cls, value):
        return value if value and _CLICK_ID.fullmatch(value) else None
