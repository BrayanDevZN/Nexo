from sqlalchemy import ForeignKey, Integer, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column

from backend.repository.db.models.base import Base, IdentityTimestampMixin


class Document(IdentityTimestampMixin, Base):
    __tablename__ = "documents"
    filename: Mapped[str] = mapped_column(String(180), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(36), unique=True, nullable=False)
    content: Mapped[bytes | None] = mapped_column(LargeBinary)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    created_by_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
