import pytest

from backend.domain.passwords import PasswordHasher
from backend.domain.tokens import JWTService
from backend.infra.connections.database import DatabaseConnection
from backend.repository.db.control.manager import RepositoryManager
from backend.repository.db.schema import create_tables
from backend.service.security import AuthenticationError, SessionSecurity


def test_persisted_password_and_session_flow_without_redis(settings):
    database = DatabaseConnection(settings)
    create_tables(database.engine)
    repositories = RepositoryManager(database)
    passwords = PasswordHasher(rounds=4)
    sessions = SessionSecurity(JWTService(settings.jwt_secret_key.get_secret_value()), repositories)
    try:
        with repositories.transaction() as repos:
            user = repos.users.create(name="Brayan", email="brayan@example.com",
                                       password_hash=passwords.hash("secure-password-123"))
            identifier = user.id
        with repositories.transaction() as repos:
            user = repos.users.by_email("BRAYAN@EXAMPLE.COM")
            assert passwords.verify("secure-password-123", user.password_hash)
            assert not passwords.verify("wrong-password", user.password_hash)
            token = sessions.issue(user)
        assert sessions.authenticate(token).id == identifier
        sessions.revoke_all(identifier)
        with pytest.raises(AuthenticationError):
            sessions.authenticate(token)
    finally:
        database.close()
