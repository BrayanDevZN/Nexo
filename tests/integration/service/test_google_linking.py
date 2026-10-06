from concurrent.futures import Future
from unittest.mock import Mock

import pytest
from pydantic import SecretStr

from backend.domain.google import GoogleIdentity
from backend.domain.passwords import PasswordHasher
from backend.service.auth import RegistrationConflict
from backend.service.runtime import RuntimeServices
from backend.service.security import AuthenticationError


@pytest.fixture
def runtime(settings, local_redis_url, monkeypatch):
    settings.redis_url = SecretStr(local_redis_url)
    settings.email = "owner@example.com"
    settings.password = SecretStr("initial-admin-password")
    monkeypatch.setattr("backend.service.runtime.PasswordHasher", lambda: PasswordHasher(rounds=4))
    runtime = RuntimeServices(settings)
    runtime.initialize(settings)
    done = Future()
    done.set_result(None)
    runtime.email.send = Mock(return_value=done)
    yield runtime
    runtime.close()


def test_linked_local_account_preserves_data_approval_password_and_sessions(runtime):
    user = runtime.auth.register(name="Ana Local", email="ana@example.com", phone="11999999999",
                                 password="strong-password-123")
    owner = runtime.auth.login("owner@example.com", "initial-admin-password")[0]
    note = runtime.approvals.notifications(owner)[0]
    runtime.approvals.decide(owner, note["id"], "approved")
    actor, local_token = runtime.auth.login(user.email, "strong-password-123")
    client = runtime.clients.create(actor, name="Loja", niche="Varejo", contract_closed=True)
    kind, google_token = runtime.google._resolve_identity(GoogleIdentity("google-user", user.email, "Google Name"))
    assert kind == "session"
    current = runtime.sessions.authenticate(google_token)
    assert current.id == user.id and current.name == "Ana Local" and current.phone == "11999999999"
    assert current.role == "member" and current.status == "approved"
    assert runtime.sessions.authenticate(local_token).id == user.id
    assert runtime.auth.login(user.email, "strong-password-123")[0].id == user.id
    assert runtime.clients.get(current, client.id)["created_by_id"] == user.id
    assert len(runtime.approvals.notifications(owner)) == 1
    with runtime.repositories.transaction() as repos:
        assert len(repos.users.list()) == 2
        assert repos.users.get(user.id).google_sub == "google-user"
        assert repos.users.get(user.id).password_hash == user.password_hash
    assert runtime.google._resolve_identity(GoogleIdentity("google-user", user.email, "Google Name"))[0] == "session"
    with pytest.raises(RegistrationConflict):
        runtime.google._resolve_identity(GoogleIdentity("another-google-user", user.email, "Google Name"))


def test_bootstrap_admin_can_use_google_and_local_login_after_restart(runtime, settings):
    owner = runtime.auth.login("owner@example.com", "initial-admin-password")[0]
    _, token = runtime.google._resolve_identity(GoogleIdentity("owner-google", owner.email, "Google Owner"))
    assert runtime.sessions.authenticate(token).id == owner.id
    runtime.auth.bootstrap_admin(settings)
    current = runtime.auth.login(owner.email, "initial-admin-password")[0]
    assert current.id == owner.id and current.role == "admin" and current.status == "approved"


def test_different_email_creates_onboarding_and_google_only_cannot_use_password(runtime):
    result, grant = runtime.google._resolve_identity(GoogleIdentity("google-only", "google@example.com", "Google Only"))
    assert result == "profile"
    csrf = runtime.google.profile(grant)["csrf_token"]
    user, token = runtime.google.complete(grant, csrf, "Google Only", "11999999999")
    assert runtime.sessions.authenticate(token).id == user.id and user.password_hash is None
    with pytest.raises(AuthenticationError):
        runtime.auth.login(user.email, "strong-password-123")
