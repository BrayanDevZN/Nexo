"""One-time, idempotent migration that adds the Owner role to existing databases.

SQLite cannot alter a CHECK constraint in place, so the users table is rebuilt
with its data and indexes preserved. Foreign keys are disabled only for that
transaction; SQLite's FK targets continue to point at the renamed users table.
"""
from sqlalchemy import inspect, text


def migrate_owner_role(engine, principal_email: str | None = None) -> None:
    inspector = inspect(engine)
    if not inspector.has_table("users"):
        return

    constraints = inspector.get_check_constraints("users")
    role_check = next((item for item in constraints if item.get("name") == "user_role"), None)
    if role_check and "'owner'" not in (role_check.get("sqltext") or "").lower():
        if engine.dialect.name == "sqlite":
            _migrate_sqlite(engine)
        else:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE users DROP CONSTRAINT user_role"))
                connection.execute(text(
                    "ALTER TABLE users ADD CONSTRAINT user_role "
                    "CHECK (role IN ('member', 'admin', 'owner'))"
                ))

    if principal_email:
        with engine.begin() as connection:
            connection.execute(
                text("UPDATE users SET role = 'owner' WHERE lower(email) = :email AND role = 'admin'"),
                {"email": principal_email.strip().lower()},
            )


def _migrate_sqlite(engine) -> None:
    columns = [item["name"] for item in inspect(engine).get_columns("users")]
    column_sql = ", ".join(f'"{name}"' for name in columns)
    with engine.connect() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        try:
            with connection.begin():
                connection.execute(text("""
                    CREATE TABLE users_owner_migration (
                        id VARCHAR(36) NOT NULL PRIMARY KEY,
                        created_at DATETIME NOT NULL,
                        updated_at DATETIME NOT NULL,
                        name VARCHAR(120) NOT NULL,
                        email VARCHAR(254) NOT NULL UNIQUE,
                        phone VARCHAR(32),
                        password_hash VARCHAR(255),
                        google_sub VARCHAR(255) UNIQUE,
                        profile_photo VARCHAR(255),
                        profile_photo_data BLOB,
                        status VARCHAR(16) NOT NULL,
                        role VARCHAR(16) NOT NULL,
                        session_version INTEGER NOT NULL,
                        CONSTRAINT user_status CHECK (status IN ('pending', 'approved', 'rejected')),
                        CONSTRAINT user_role CHECK (role IN ('member', 'admin', 'owner')),
                        CONSTRAINT session_version_nonnegative CHECK (session_version >= 0),
                        CONSTRAINT user_identity CHECK (password_hash IS NOT NULL OR google_sub IS NOT NULL)
                    )
                """))
                connection.execute(text(
                    f"INSERT INTO users_owner_migration ({column_sql}) "
                    f"SELECT {column_sql} FROM users"
                ))
                connection.execute(text("DROP TABLE users"))
                connection.execute(text("ALTER TABLE users_owner_migration RENAME TO users"))
                connection.execute(text(
                    "CREATE INDEX IF NOT EXISTS user_status_created_at_id "
                    "ON users (status, created_at, id)"
                ))
                connection.execute(text(
                    "CREATE INDEX IF NOT EXISTS user_role_created_at_id "
                    "ON users (role, created_at, id)"
                ))
        finally:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
