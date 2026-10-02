import pytest
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError

from backend.infra.connections.database import DatabaseConnection
from backend.repository.db.control.manager import RepositoryManager
from backend.repository.db.schema import create_tables


@pytest.fixture
def repositories(settings):
    db = DatabaseConnection(settings)
    create_tables(db.engine)
    yield db, RepositoryManager(db)
    db.close()


def test_tables_are_idempotent_and_defaults_persist(repositories):
    db, manager = repositories
    with manager.transaction() as repos:
        user = repos.users.create(name="Brayan", email="USER@Example.com", password_hash="hash")
        identifier = user.id
    create_tables(db.engine)
    assert set(inspect(db.engine).get_table_names()) == {"users", "clients", "notifications"}
    with manager.transaction() as repos:
        user = repos.users.by_email("user@example.com")
        assert user.id == identifier
        assert user.status == "pending" and user.role == "member"
        assert user.created_at is not None


def test_unique_identity_and_constraints(repositories):
    _, manager = repositories
    with manager.transaction() as repos:
        repos.users.create(name="A", email="a@example.com", password_hash="hash")
    with pytest.raises(IntegrityError):
        with manager.transaction() as repos:
            repos.users.create(name="B", email="A@EXAMPLE.COM", password_hash="hash")
    with pytest.raises(IntegrityError):
        with manager.transaction() as repos:
            repos.users.create(name="C", email="c@example.com")
    with pytest.raises(IntegrityError):
        with manager.transaction() as repos:
            repos.users.create(name="C", email="c@example.com", password_hash="hash", role="owner")


def test_clients_crud_filters_and_ownership(repositories):
    _, manager = repositories
    with manager.transaction() as repos:
        owner = repos.users.create(name="Admin", email="admin@example.com", password_hash="hash")
        client = repos.clients.create(name="Loja", niche="varejo", created_by_id=owner.id)
        identifier = client.id
    with manager.transaction() as repos:
        client = repos.clients.get(identifier)
        repos.clients.update(client, contract_closed=True, notes="Fechado")
        assert len(repos.clients.list(niche="varejo", contract_closed=True)) == 1
        assert repos.clients.list(contract_closed=False) == []
    with pytest.raises(IntegrityError):
        with manager.transaction() as repos:
            repos.users.delete(owner.id)
    with manager.transaction() as repos:
        assert repos.clients.delete(identifier)
        assert not repos.clients.delete(identifier)
    with pytest.raises(IntegrityError):
        with manager.transaction() as repos:
            repos.clients.create(name="Loja", niche="varejo", created_by_id="missing")


def test_approval_transaction_is_atomic(repositories):
    _, manager = repositories
    with manager.transaction() as repos:
        admin = repos.users.create(name="Admin", email="admin@example.com", password_hash="hash",
                                   role="admin", status="approved")
        user = repos.users.create(name="User", email="user@example.com", google_sub="google-123")
        notice = repos.notifications.create_approval_request(recipient_id=admin.id,
                                                              requested_user_id=user.id)
        user_id, notice_id, admin_id = user.id, notice.id, admin.id
    with pytest.raises(RuntimeError):
        with manager.transaction() as repos:
            repos.users.set_status(repos.users.get(user_id), "approved")
            repos.notifications.resolve(repos.notifications.get(notice_id), "approved")
            raise RuntimeError("rollback whole operation")
    with manager.transaction() as repos:
        assert repos.users.get(user_id).status == "pending"
        assert repos.users.get(user_id).session_version == 0
        assert len(repos.notifications.list_for_recipient(admin_id, unresolved_only=True)) == 1
        assert repos.notifications.list_for_recipient(user_id) == []
        repos.users.set_status(repos.users.get(user_id), "approved")
        repos.notifications.resolve(repos.notifications.get(notice_id), "approved")
    with manager.transaction() as repos:
        assert repos.users.get(user_id).session_version == 1
        assert repos.notifications.list_for_recipient(admin_id, unresolved_only=True) == []
        assert repos.users.by_google_sub("google-123").id == user_id
