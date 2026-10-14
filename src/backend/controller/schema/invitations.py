from typing import Literal

from pydantic import BaseModel, ConfigDict


class InvitationCreateInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["commercial", "dev", "admin"]


class InvitationOutput(BaseModel):
    url: str
    role: Literal["commercial", "dev", "admin"]
    expires_in: int


class InvitationInfoOutput(BaseModel):
    role: Literal["commercial", "dev", "admin"]
    expires_in: int
