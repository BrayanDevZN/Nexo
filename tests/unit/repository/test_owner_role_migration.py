from sqlalchemy import create_engine, event, text

from backend.repository.db.migrations.owner_role import migrate_owner_role


def test_owner_role_migration_preserves_rows_and_foreign_keys():
    engine = create_engine("sqlite:///:memory:")
    event.listen(engine, "connect", lambda dbapi, _: dbapi.execute("PRAGMA foreign_keys=ON"))
    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE users (
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
                CONSTRAINT user_role CHECK (role IN ('member', 'admin')),
                CONSTRAINT session_version_nonnegative CHECK (session_version >= 0),
                CONSTRAINT user_identity CHECK (password_hash IS NOT NULL OR google_sub IS NOT NULL)
            )
        """))
        connection.execute(text("""
            CREATE TABLE owned_records (
                id INTEGER PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL REFERENCES users(id)
            )
        """))
        for identifier, email, role in [
            ("principal", "owner@example.com", "admin"),
            ("member", "member@example.com", "member"),
        ]:
            connection.execute(text("""
                INSERT INTO users (id, created_at, updated_at, name, email, password_hash,
                                   status, role, session_version)
                VALUES (:id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, :name, :email,
                        'hash', 'approved', :role, 0)
            """), {"id": identifier, "name": email, "email": email, "role": role})
        connection.execute(text("INSERT INTO owned_records (id, user_id) VALUES (1, 'member')"))

    migrate_owner_role(engine, "owner@example.com")

    with engine.connect() as connection:
        users = connection.execute(text("SELECT id, role FROM users ORDER BY id")).all()
        assert users == [("member", "member"), ("principal", "owner")]
        assert connection.execute(text("SELECT user_id FROM owned_records")).scalar_one() == "member"
        assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []
        connection.execute(text("""
            INSERT INTO users (id, created_at, updated_at, name, email, password_hash,
                               status, role, session_version)
            VALUES ('owner-2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Owner 2',
                    'owner2@example.com', 'hash', 'approved', 'owner', 0)
        """))
