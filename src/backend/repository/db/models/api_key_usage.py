from datetime import date

from sqlalchemy import Date, ForeignKey, Index, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from backend.repository.db.models.base import Base


class ApiKeyUsage(Base):
    __tablename__ = "api_key_usage"
    __table_args__ = (
        UniqueConstraint("api_key_id", "usage_date", name="api_key_usage_key_date"),
        Index("api_key_usage_key_date_idx", "api_key_id", "usage_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    api_key_id: Mapped[str] = mapped_column(ForeignKey("api_keys.id", ondelete="CASCADE"), nullable=False)
    usage_date: Mapped[date] = mapped_column(Date, nullable=False)
    request_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
