import pytest
from pydantic import SecretStr

from backend.domain.passwords import PasswordHasher
from backend.domain.tokens import JWTService
from backend.infra.connections.database import DatabaseConnection
from backend.repository.db.control.manager import RepositoryManager
from backend.repository.db.schema import create_tables
from backend.service.auth import AuthService, RegistrationConflict
from backend.service.security import AuthenticationError, SessionSecurity


@pytest.fixture
def auth(settings):
    database = DatabaseConnection(settings)
    create_tables(database.engine)
    repositories = RepositoryManager(database)
    sessions = SessionSecurity(JWTService("test-auth-key-" * 4), repositories)
    service = AuthService(repositories, PasswordHasher(rounds=4), sessions)
    yield service
    database.close()


def test_register_login_duplicate_and_rejected_session(auth):
    user = auth.register(name="Ana", email="ANA@example.com", phone="+5511999999999",
                         password="strong-password-123")
    assert user.status == "pending" and user.role == "member"
    assert user.password_hash != "strong-password-123"
    _, token = auth.login("ana@example.com", "strong-password-123")
    assert auth.sessions.authenticate(token).id == user.id
    with pytest.raises(RegistrationConflict):
        auth.register(name="Other", email="ana@example.com", phone="+5511999999999",
                      password="strong-password-123")
    with auth.repositories.transaction() as repos:
        repos.users.set_status(repos.users.get(user.id), "rejected")
    with pytest.raises(AuthenticationError):
        auth.login("ana@example.com", "strong-password-123")
    with pytest.raises(AuthenticationError):
        auth.sessions.authenticate(token)


@pytest.mark.parametrize("email", ["missing@example.com", "ana@example.com"])
def test_login_failure_has_generic_error(auth, email):
    auth.register(name="Ana", email="ana@example.com", phone="+5511999999999",
                  password="strong-password-123")
    with pytest.raises(AuthenticationError, match="Invalid email or password"):
        auth.login(email, "incorrect-password")


def test_bootstrap_preserves_changed_password(auth, settings):
    settings.admin_email = "owner@example.com"
    settings.admin_password = SecretStr("initial-admin-password")
    auth.bootstrap_admin(settings)
    with auth.repositories.transaction() as repos:
        admin = repos.users.by_email(settings.admin_email)
        assert admin.role == "admin" and admin.status == "approved"
        repos.users.set_password(admin, auth.passwords.hash("changed-admin-password"))
    auth.bootstrap_admin(settings)
    _, token = auth.login("owner@example.com", "changed-admin-password")
    assert auth.sessions.authenticate(token).session_version == 1
    with pytest.raises(AuthenticationError):
        auth.login("owner@example.com", "initial-admin-password")
    with auth.repositories.transaction() as repos:
        assert len(repos.users.list()) == 1


def test_bootstrap_does_not_promote_registered_member(auth, settings):
    auth.register(name="Ana", email="owner@example.com", phone="+5511999999999",
                  password="strong-password-123")
    settings.admin_email = "owner@example.com"
    settings.admin_password = SecretStr("initial-admin-password")
    with pytest.raises(RuntimeError, match="not an approved administrator"):
        auth.bootstrap_admin(settings)
    with auth.repositories.transaction() as repos:
        assert repos.users.by_email(settings.admin_email).role == "member"
