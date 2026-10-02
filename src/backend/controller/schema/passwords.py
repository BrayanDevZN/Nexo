import re

from pydantic import BaseModel, ConfigDict, EmailStr, SecretStr, field_validator

from backend.controller.schema.auth import validate_new_password


class NewPasswordInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    new_password: SecretStr

    @field_validator("new_password")
    @classmethod
    def password_policy(cls, value):
        return validate_new_password(value)


class PasswordChangeInput(NewPasswordInput):
    current_password: SecretStr


class RecoveryRequestInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr


class RecoveryConfirmInput(NewPasswordInput):
    email: EmailStr
    code: SecretStr

    @field_validator("code")
    @classmethod
    def numeric_code(cls, value):
        if not re.fullmatch(r"[0-9]{8}", value.get_secret_value()):
            raise ValueError("Code must contain 8 digits")
        return value
