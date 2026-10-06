from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ChatSend(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["chat.send"]
    member_id: UUID
    client_id: UUID
    text: str = Field(min_length=1, max_length=4000)


class ChatMessageOutput(BaseModel):
    id: str
    sequence: int
    sender_id: str
    recipient_id: str
    sender_name: str
    client_id: str
    kind: Literal["text", "image", "audio"]
    text: str | None
    media_type: str | None
    size: int | None
    created_at: datetime
