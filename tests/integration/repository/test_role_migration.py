import pytest
from sqlalchemy import create_engine, text

from backend.repository.db.schema import create_tables


@pytest.mark.parametrize("old_roles", ["'member', 'admin'", "'member', 'admin', 'owner'"])
def test_existing_users_and_references_survive_role_migration(tmp_path, old_roles):
    engine = create_engine(f"sqlite:///{tmp_path / 'roles.db'}")
    with engine.begin() as connection:
        connection.exec_driver_sql(f"""CREATE TABLE users (
            id VARCHAR(36) PRIMARY KEY, created_at DATETIME, updated_at DATETIME,
            name VARCHAR(120) NOT NULL, email VARCHAR(254) NOT NULL UNIQUE,
            phone VARCHAR(32), password_hash VARCHAR(255), google_sub VARCHAR(255) UNIQUE,
            profile_photo VARCHAR(255), profile_photo_data BLOB,
            status VARCHAR(16) NOT NULL, role VARCHAR(16) NOT NULL
                CONSTRAINT user_role CHECK (role IN ({old_roles})),
            session_version INTEGER NOT NULL DEFAULT 0
        )""")
        connection.exec_driver_sql("""INSERT INTO users
            (id, name, email, password_hash, status, role, session_version)
            VALUES ('principal', 'Owner', 'owner@example.com', 'hash', 'approved', 'admin', 0),
                   ('salesperson', 'Sales', 'sales@example.com', 'hash', 'approved', 'member', 0)""")
        connection.exec_driver_sql("""CREATE TABLE legacy_clients (
            id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id)
        )""")
        connection.exec_driver_sql("INSERT INTO legacy_clients VALUES ('first', 'salesperson')")

    create_tables(engine, "owner@example.com")
    create_tables(engine, "owner@example.com")
    with engine.connect() as connection:
        users = connection.execute(text("SELECT id, role FROM users ORDER BY id")).all()
        assert users == [("principal", "owner"), ("salesperson", "commercial")]
        assert connection.execute(text("SELECT user_id FROM legacy_clients")).scalar_one() == "salesperson"
        assert connection.exec_driver_sql("PRAGMA foreign_key_check").fetchall() == []
        assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
        assert connection.exec_driver_sql("PRAGMA index_list('users')").fetchall()
    engine.dispose()
