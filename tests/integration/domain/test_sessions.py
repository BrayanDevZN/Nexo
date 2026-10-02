import pytest

from backend.domain.passwords import PasswordHasher
from backend.domain.tokens import JWTService
from backend.infra.connections.database import DatabaseConnection
from backend.repository.db.control.manager import RepositoryManager
from backend.repository.db.schema import create_tables
from backend.service.security import AuthenticationError, SessionSecurity


@pytest.fixture
def security(settings):
    db = DatabaseConnection(settings)
    create_tables(db.engine)
    repos = RepositoryManager(db)
    sessions = SessionSecurity(JWTService(settings.jwt_secret_key.get_secret_value()), repos)
    with repos.transaction() as tables:
        user = tables.users.create(name="User", email="user@example.com",
                                   password_hash=PasswordHasher(rounds=4).hash("password-test-123"))
    yield sessions, repos, user
    db.close()


def test_revoke_all_invalidates_existing_tokens(security):
    sessions, _, user = security
    first, second = sessions.issue(user), sessions.issue(user)
    assert sessions.authenticate(first).status == "pending"
    assert sessions.revoke_all(user.id)
    for token in [first, second]:
        with pytest.raises(AuthenticationError):
            sessions.authenticate(token)
    current = sessions.authenticate(sessions.tokens.create(user.id, 1))
    assert current.id == user.id


def test_password_change_and_rejection_invalidate_sessions(security):
    sessions, repos, user = security
    token = sessions.issue(user)
    with repos.transaction() as tables:
        tables.users.set_password(tables.users.get(user.id),
                                  PasswordHasher(rounds=4).hash("new-password-123"))
    with pytest.raises(AuthenticationError):
        sessions.authenticate(token)
    token = sessions.tokens.create(user.id, 1)
    with repos.transaction() as tables:
        tables.users.set_status(tables.users.get(user.id), "rejected")
    with pytest.raises(AuthenticationError):
        sessions.authenticate(token)
    with pytest.raises(AuthenticationError):
        sessions.authenticate(sessions.tokens.create(user.id, 2))


def test_revocation_is_rolled_back_with_transaction(security):
    sessions, repos, user = security
    token = sessions.issue(user)
    with pytest.raises(RuntimeError):
        with repos.transaction() as tables:
            tables.users.revoke_sessions(tables.users.get(user.id))
            raise RuntimeError("rollback")
    assert sessions.authenticate(token).id == user.id
    with repos.transaction() as tables:
        tables.users.delete(user.id)
    with pytest.raises(AuthenticationError):
        sessions.authenticate(token)
