from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Index, Integer, LargeBinary, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from backend.repository.db.models.base import Base, utc_now


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (
        UniqueConstraint("sender_id", "client_id", name="chat_sender_nonce"),
        Index("chat_pair_sequence", "sender_id", "recipient_id", "sequence"),
    )
    sequence: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id: Mapped[str] = mapped_column(String(36), unique=True, default=lambda: str(uuid4()))
    sender_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    recipient_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    sender_name: Mapped[str] = mapped_column(String(120))
    client_id: Mapped[str] = mapped_column(String(36))
    text: Mapped[str | None] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(16), default="text")
    storage_key: Mapped[str | None] = mapped_column(String(36))
    media_data: Mapped[bytes | None] = mapped_column(LargeBinary)
    media_type: Mapped[str | None] = mapped_column(String(80))
    size: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
