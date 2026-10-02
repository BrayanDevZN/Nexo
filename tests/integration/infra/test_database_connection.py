import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from backend.infra.connections.database import DatabaseConnection


def test_transactions_rollback_and_persistence(settings):
    connection = DatabaseConnection(settings)
    try:
        with connection.session() as session:
            session.execute(text("CREATE TABLE probe (id INTEGER PRIMARY KEY)"))
        with connection.session() as session:
            session.execute(text("INSERT INTO probe VALUES (1)"))
        with pytest.raises(RuntimeError):
            with connection.session() as session:
                session.execute(text("INSERT INTO probe VALUES (2)"))
                raise RuntimeError("rollback")
        with connection.session() as session:
            assert session.execute(text("SELECT id FROM probe")).scalars().all() == [1]
        assert connection.ping()
    finally:
        connection.close()
    reopened = DatabaseConnection(settings)
    try:
        with reopened.session() as session:
            assert session.execute(text("SELECT id FROM probe")).scalar_one() == 1
    finally:
        reopened.close()


def test_foreign_keys_enforced(settings):
    connection = DatabaseConnection(settings)
    try:
        with connection.session() as session:
            session.execute(text("CREATE TABLE parent (id INTEGER PRIMARY KEY)"))
            session.execute(text("CREATE TABLE child (parent_id INTEGER REFERENCES parent(id))"))
        with pytest.raises(IntegrityError):
            with connection.session() as session:
                session.execute(text("INSERT INTO child VALUES (99)"))
    finally:
        connection.close()
