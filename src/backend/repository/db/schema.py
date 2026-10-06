from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from backend.repository.db.models import Base


def create_tables(engine: Engine) -> None:
    """Create missing tables and apply additive, data-preserving schema changes."""
    Base.metadata.create_all(engine)
    # Existing Railway volumes already contain the notifications table. Add the
    # announcement fields in place so deploying this feature preserves history.
    columns = {column["name"] for column in inspect(engine).get_columns("notifications")}
    additions = {"announcement_id": "VARCHAR(36)", "title": "VARCHAR(160)", "body": "TEXT"}
    missing = {name: definition for name, definition in additions.items() if name not in columns}
    if missing:
        with engine.begin() as connection:
            for name, definition in missing.items():
                connection.execute(text(f"ALTER TABLE notifications ADD COLUMN {name} {definition}"))
