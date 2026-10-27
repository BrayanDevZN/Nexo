import re

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from backend.domain.client_channels import SALES_CHANNELS
from backend.domain.pipeline_stages import PIPELINE_STAGES
from backend.repository.db.models import Base


def _migrate_user_roles(engine: Engine, principal_email: str | None) -> None:
    """Rebuild the old SQLite role CHECK while keeping account IDs and foreign keys."""
    with engine.connect() as connection:
        sql = connection.execute(text("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'")).scalar_one()
        if "'commercial'" not in sql:
            migrated = sql.replace("role IN ('member', 'admin', 'owner')",
                                   "role IN ('commercial', 'dev', 'admin', 'owner')")
            migrated = migrated.replace("role IN ('member', 'admin')",
                                        "role IN ('commercial', 'dev', 'admin', 'owner')")
            migrated = re.sub(r'^CREATE TABLE ["`]?users["`]?', 'CREATE TABLE users_role_migration', migrated, count=1)
            if migrated == sql or "users_role_migration" not in migrated or "'commercial'" not in migrated:
                raise RuntimeError("Cannot safely migrate the users role constraint")
            columns = [column["name"] for column in inspect(connection).get_columns("users")]
            names = ", ".join('"' + column.replace('"', '""') + '"' for column in columns)
            selected = ", ".join("CASE WHEN role='member' THEN 'commercial' ELSE role END"
                                 if column == "role" else '"' + column.replace('"', '""') + '"'
                                 for column in columns)
            connection.commit()
            connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
            connection.commit()
            try:
                with connection.begin():
                    connection.exec_driver_sql(migrated)
                    connection.exec_driver_sql(f"INSERT INTO users_role_migration ({names}) SELECT {selected} FROM users")
                    connection.exec_driver_sql("DROP TABLE users")
                    connection.exec_driver_sql("ALTER TABLE users_role_migration RENAME TO users")
                    if connection.exec_driver_sql("PRAGMA foreign_key_check").fetchall():
                        raise RuntimeError("User role migration would break foreign keys")
            finally:
                connection.exec_driver_sql("PRAGMA foreign_keys=ON")
                connection.commit()
        if principal_email:
            connection.execute(text("UPDATE users SET role='owner', session_version=session_version+1 "
                                    "WHERE lower(email)=:email AND role='admin'"),
                               {"email": principal_email.lower()})
        else:
            connection.execute(text("UPDATE users SET role='owner', session_version=session_version+1 "
                                    "WHERE role='admin' AND NOT EXISTS (SELECT 1 FROM users WHERE role='owner') "
                                    "AND id=(SELECT id FROM users WHERE role='admin' ORDER BY created_at, id LIMIT 1)"))
        connection.commit()


def _quoted(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{value}'" for value in values)


def _migrate_client_checks(engine: Engine) -> None:
    """Widen the stage and channel CHECKs of tables created before the paid-traffic funnel, keeping every row."""
    with engine.connect() as connection:
        sql = connection.execute(text("SELECT sql FROM sqlite_master WHERE type='table' AND name='clients'")).scalar_one()
        migrated = sql
        for column, values in (("pipeline_stage", PIPELINE_STAGES), ("sales_channel", SALES_CHANNELS)):
            pattern = rf"({column} (?:IS NULL OR {column} )?IN \()[^)]*(\))"
            migrated = re.sub(pattern, lambda match: match.group(1) + _quoted(values) + match.group(2), migrated)
        if migrated == sql:
            return
        migrated = re.sub(r'^CREATE TABLE ["`]?clients["`]?', "CREATE TABLE clients_check_migration", migrated, count=1)
        if "clients_check_migration" not in migrated:
            raise RuntimeError("Cannot safely migrate the clients constraints")
        names = ", ".join('"' + column["name"].replace('"', '""') + '"' for column in inspect(connection).get_columns("clients"))
        connection.commit()
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        connection.commit()
        try:
            with connection.begin():
                connection.exec_driver_sql(migrated)
                connection.exec_driver_sql(f"INSERT INTO clients_check_migration ({names}) SELECT {names} FROM clients")
                connection.exec_driver_sql("DROP TABLE clients")
                connection.exec_driver_sql("ALTER TABLE clients_check_migration RENAME TO clients")
                if connection.exec_driver_sql("PRAGMA foreign_key_check").fetchall():
                    raise RuntimeError("Client constraint migration would break foreign keys")
        finally:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            connection.commit()


def create_tables(engine: Engine, principal_email: str | None = None) -> None:
    """Create missing tables and apply additive, data-preserving schema changes."""
    Base.metadata.create_all(engine)
    _migrate_user_roles(engine, principal_email)
    # Existing Railway volumes already contain the notifications table. Add the
    # announcement fields in place so deploying this feature preserves history.
    columns = {column["name"] for column in inspect(engine).get_columns("notifications")}
    additions = {"announcement_id": "VARCHAR(36)", "title": "VARCHAR(160)", "body": "TEXT",
                 "image_storage_key": "VARCHAR(64)", "audience": "VARCHAR(16)"}
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
    if "user_id" not in {column["name"] for column in inspect(engine).get_columns("maps_credentials")}:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE maps_credentials ADD COLUMN user_id VARCHAR(36)"))
    if "address" not in client_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE clients ADD COLUMN address VARCHAR(300)"))
    if "sales_channel" not in client_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE clients ADD COLUMN sales_channel VARCHAR(24)"))
    if "pain" not in client_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE clients ADD COLUMN pain TEXT"))
    if "approach" not in client_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE clients ADD COLUMN approach TEXT"))
    _migrate_client_checks(engine)
    maps_job_columns = {column["name"] for column in inspect(engine).get_columns("maps_jobs")}
    with engine.begin() as connection:
        for name, definition in (("auto_expand", "BOOLEAN NOT NULL DEFAULT 0"), ("radius", "INTEGER"),
                                 ("start_radius", "INTEGER"), ("params", "TEXT"), ("expanded_to", "VARCHAR(36)")):
            if name not in maps_job_columns:
                connection.execute(text(f"ALTER TABLE maps_jobs ADD COLUMN {name} {definition}"))
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
        document_columns = {item["name"] for item in inspector.get_columns("documents")}
        if "client_id" not in document_columns:
            connection.execute(text("ALTER TABLE documents ADD COLUMN client_id VARCHAR(36)"))
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
        "CREATE INDEX IF NOT EXISTS document_client_created_at ON documents (client_id, created_at, id)",
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

