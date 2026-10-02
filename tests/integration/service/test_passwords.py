from concurrent.futures import Future
from unittest.mock import Mock

import pytest
from pydantic import SecretStr

from backend.domain.passwords import PasswordHasher
from backend.service.passwords import PasswordRecoveryError
from backend.service.runtime import RuntimeServices
from backend.service.security import AuthenticationError


@pytest.fixture
def runtime(settings, local_redis_url, monkeypatch):
    settings.redis_url = SecretStr(local_redis_url)
    settings.email = "sender@example.com"
    settings.password = SecretStr("test-smtp-secret")
    monkeypatch.setattr("backend.service.runtime.PasswordHasher", lambda: PasswordHasher(rounds=4))
    service = RuntimeServices(settings)
    service.initialize(settings)
    # Sender mock preserves the asynchronous Future contract without contacting Gmail.
    done = Future()
    done.set_result(None)
    service.email.send = Mock(return_value=done)
    service.password_service.codes.create = Mock(return_value="12345678")
    service.auth.register(name="Ana", email="ana@example.com", phone="11999999999",
                          password="initial-password-123")
    service.email.send.reset_mock()
    yield service
    service.close()


def test_change_password_invalidates_sessions_and_stale_recovery_code(runtime):
    actor, token = runtime.auth.login("ana@example.com", "initial-password-123")
    runtime.password_service.request_code(actor.email)
    with pytest.raises(PasswordRecoveryError):
        runtime.password_service.change(actor, "wrong-current", "changed-password-123")
    assert runtime.sessions.authenticate(token).id == actor.id
    runtime.password_service.change(actor, "initial-password-123", "changed-password-123")
    with pytest.raises(AuthenticationError):
        runtime.sessions.authenticate(token)
    with pytest.raises(PasswordRecoveryError):
        runtime.password_service.confirm(actor.email, "12345678", "attacker-password-123")
    runtime.auth.login(actor.email, "changed-password-123")
    with pytest.raises(AuthenticationError):
        runtime.password_service.change(actor, "initial-password-123", "another-password-123")


def test_email_code_reset_is_single_use_and_preserves_pending_role(runtime):
    runtime.password_service.request_code("ana@example.com")
    runtime.password_service.confirm("ana@example.com", "12345678", "changed-password-123")
    user, _ = runtime.auth.login("ana@example.com", "changed-password-123")
    assert user.role == "member" and user.status == "pending"
    with pytest.raises(PasswordRecoveryError):
        runtime.password_service.confirm(user.email, "12345678", "another-password-123")
    with pytest.raises(AuthenticationError):
        runtime.auth.login(user.email, "initial-password-123")


def test_unknown_google_only_and_rejected_addresses_never_receive_codes(runtime):
    with runtime.repositories.transaction() as repos:
        repos.users.create(name="Google", email="google@example.com", google_sub="google-user")
        user = repos.users.by_email("ana@example.com")
        repos.users.set_status(user, "rejected")
    for email in ["missing@example.com", "google@example.com", "ana@example.com"]:
        runtime.password_service.request_code(email)
        with pytest.raises(PasswordRecoveryError):
            runtime.password_service.confirm(email, "12345678", "changed-password-123")
    runtime.email.send.assert_not_called()


def test_failed_delivery_removes_only_its_current_challenge(runtime):
    failed = Future()
    failed.set_exception(RuntimeError("synthetic smtp failure"))
    runtime.email.send.return_value = failed
    runtime.password_service.request_code("ana@example.com")
    with pytest.raises(PasswordRecoveryError):
        runtime.password_service.confirm("ana@example.com", "12345678", "changed-password-123")


def test_sql_failure_after_consumption_does_not_change_password(runtime, monkeypatch):
    runtime.password_service.request_code("ana@example.com")
    monkeypatch.setattr("backend.repository.db.control.users.UserRepository.replace_password_if_current",
                        Mock(side_effect=RuntimeError("synthetic sql failure")))
    with pytest.raises(RuntimeError):
        runtime.password_service.confirm("ana@example.com", "12345678", "changed-password-123")
    runtime.auth.login("ana@example.com", "initial-password-123")
    with pytest.raises(PasswordRecoveryError):
        runtime.password_service.confirm("ana@example.com", "12345678", "changed-password-123")
