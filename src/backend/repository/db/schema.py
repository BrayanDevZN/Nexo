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
    client_columns = {column["name"] for column in inspect(engine).get_columns("clients")}
    if "contract_value" not in client_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE clients ADD COLUMN contract_value NUMERIC(12, 2)"))
    if "pipeline_stage" not in client_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE clients ADD COLUMN pipeline_stage VARCHAR(24) DEFAULT 'lead'"))
    if "next_follow_up" not in client_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE clients ADD COLUMN next_follow_up DATETIME"))
    if "contract_closed_at" not in client_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE clients ADD COLUMN contract_closed_at DATETIME"))
            # Existing closed contracts have no closure timestamp. Use their last
            # recorded update as the best available historical approximation.
            connection.execute(text(
                "UPDATE clients SET contract_closed_at = updated_at "
                "WHERE (contract_closed = 1 OR pipeline_stage = 'won') AND updated_at IS NOT NULL"
            ))
    if "pain" not in client_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE clients ADD COLUMN pain TEXT"))
    if "approach" not in client_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE clients ADD COLUMN approach TEXT"))
    blob_columns = {
        "users": ("profile_photo_data", "BLOB"),
        "documents": ("content", "BLOB"),
        "chat_messages": ("media_data", "BLOB"),
    }
    with engine.begin() as connection:
        inspector = inspect(connection)
        for table, (column, definition) in blob_columns.items():
            columns_for_table = {item["name"] for item in inspector.get_columns(table)}
            if column not in columns_for_table:
                connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))
    missing = {name: definition for name, definition in additions.items() if name not in columns}
    if missing:
        with engine.begin() as connection:
            for name, definition in missing.items():
                connection.execute(text(f"ALTER TABLE notifications ADD COLUMN {name} {definition}"))
    # create_all does not reliably add a new index to every pre-existing
    # SQLite table.  Keep these additive and idempotent for Railway volumes.
    indexes = (
        "CREATE INDEX IF NOT EXISTS client_created_at_id ON clients (created_at, id)",
        "CREATE INDEX IF NOT EXISTS client_closed_created_at ON clients (contract_closed, created_at)",
        "CREATE INDEX IF NOT EXISTS client_creator_created_at ON clients (created_by_id, created_at)",
        "CREATE INDEX IF NOT EXISTS client_niche_created_at ON clients (niche, created_at)",
        "CREATE INDEX IF NOT EXISTS client_stage_created_at ON clients (pipeline_stage, created_at)",
        "CREATE INDEX IF NOT EXISTS document_created_at_id ON documents (created_at, id)",
        "CREATE INDEX IF NOT EXISTS notification_recipient_kind_created ON notifications (recipient_id, kind, created_at, id)",
        "CREATE INDEX IF NOT EXISTS notification_recipient_resolved_created ON notifications (recipient_id, resolved_at, created_at, id)",
        "CREATE INDEX IF NOT EXISTS user_status_created_at_id ON users (status, created_at, id)",
        "CREATE INDEX IF NOT EXISTS user_role_created_at_id ON users (role, created_at, id)",
    )
    with engine.begin() as connection:
        for statement in indexes:
            connection.execute(text(statement))
        # Replaced by the composite indexes above.  Removing redundant
        # indexes reduces SQLite work on every insert/update.
        for name in ("ix_clients_niche", "ix_clients_pipeline_stage", "ix_clients_created_by_id",
                     "ix_notifications_recipient_id", "ix_users_status"):
            connection.execute(text(f"DROP INDEX IF EXISTS {name}"))
        connection.execute(text("PRAGMA optimize"))
