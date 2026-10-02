import re

from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr, field_validator


class LoginInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    password: SecretStr


class ProfileInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(min_length=10, max_length=30)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        if not value.strip():
            raise ValueError("Name is required")
        return value.strip()

    @field_validator("phone")
    @classmethod
    def clean_phone(cls, value):
        if not re.fullmatch(r"[+0-9 ()-]+", value):
            raise ValueError("Invalid phone number")
        digits = re.sub(r"\D", "", value)
        if not 10 <= len(digits) <= 15:
            raise ValueError("Phone requires 10 to 15 digits")
        return "+" + digits



class RegistrationInput(LoginInput, ProfileInput):
    @field_validator("password")
    @classmethod
    def password_policy(cls, value):
        password = value.get_secret_value()
        try:
            size = len(password.encode("utf-8"))
        except UnicodeError:
            raise ValueError("Password must be valid UTF-8") from None
        if len(password) < 12 or size > 72:
            raise ValueError("Password requires at least 12 characters and at most 72 UTF-8 bytes")
        return value


class UserOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    email: str
    phone: str | None
    profile_photo: str | None
    status: str
    role: str
