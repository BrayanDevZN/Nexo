import re

from pydantic import BaseModel, ConfigDict, SecretStr, field_validator


class DeletionConfirmInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: SecretStr

    @field_validator("code")
    @classmethod
    def valid_code(cls, value):
        if not re.fullmatch(r"[0-9]{8}", value.get_secret_value()):
            raise ValueError("Code must contain 8 digits")
        return value
