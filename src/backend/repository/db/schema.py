from sqlalchemy.engine import Engine

from backend.repository.db.models import Base


def create_tables(engine: Engine) -> None:
    """Create missing tables; never drop data or pretend to migrate existing schemas."""
    Base.metadata.create_all(engine)
