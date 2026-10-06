from concurrent.futures import Future
from unittest.mock import Mock

import pytest
from pydantic import SecretStr

from backend.domain.passwords import PasswordHasher
from backend.infra.connections.email import EmailUnavailableError
from backend.service.access import AccessDenied, ResourceConflict
from backend.service.account_deletion import DeletionCodeError, DeletionCooldownError
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
    runtime.account_deletion.sender = Mock(configured=True, send=Mock(return_value=done))
    runtime.account_deletion.codes.create = Mock(return_value="12345678")
    yield runtime
    runtime.close()


def user(runtime):
    runtime.auth.register(name="Ana", email="ana@example.com", phone="11999999999",
                          password="member-password-123")
    return runtime.auth.login("ana@example.com", "member-password-123")


def test_delete_own_account_preserves_clients_and_revokes_every_session(runtime):
    actor, token = user(runtime)
    owner = runtime.auth.login("owner@example.com", "initial-admin-password")[0]
    note = runtime.approvals.notifications(owner)[0]
    runtime.approvals.decide(owner, note["id"], "approved")
    actor = runtime.sessions.authenticate(token)
    client = runtime.clients.create(actor, name="Loja", niche="Varejo", contract_closed=True)
    runtime.members.directory(actor)
    runtime.account_deletion.request(actor)
    runtime.account_deletion.confirm(actor, "12345678")
    assert runtime.clients.get(owner, client.id)["created_by_id"] == owner.id
    assert runtime.approvals.notifications(owner) == []
    assert [row["id"] for row in runtime.members.directory(owner)] == [owner.id]
    with pytest.raises(AuthenticationError):
        runtime.sessions.authenticate(token)
    with pytest.raises(AccessDenied):
        runtime.account_deletion.confirm(actor, "12345678")


def test_pending_account_code_has_cooldown_attempt_limit_and_single_use(runtime):
    actor, _ = user(runtime)
    runtime.account_deletion.request(actor)
    with pytest.raises(DeletionCooldownError):
        runtime.account_deletion.request(actor)
    for _ in range(runtime.account_deletion.code_repository.max_attempts):
        with pytest.raises(DeletionCodeError):
            runtime.account_deletion.confirm(actor, "00000000")
    with pytest.raises(DeletionCodeError):
        runtime.account_deletion.confirm(actor, "12345678")
    with runtime.repositories.transaction() as repos:
        assert repos.users.get(actor.id)


def test_expired_or_previous_version_code_cannot_delete(runtime):
    actor, _ = user(runtime)
    runtime.account_deletion.request(actor)
    runtime.sessions.revoke_all(actor.id)
    current, _ = runtime.auth.login(actor.email, "member-password-123")
    with pytest.raises(DeletionCodeError):
        runtime.account_deletion.confirm(current, "12345678")
    repo = runtime.account_deletion.code_repository
    repo.redis.delete(repo.key(actor.email) + ":cooldown")
    runtime.account_deletion.request(current)
    repo.redis.expire(repo.key(actor.email), 0)
    with pytest.raises(DeletionCodeError):
        runtime.account_deletion.confirm(current, "12345678")


def test_principal_is_protected_and_failed_delivery_allows_retry(runtime):
    owner = runtime.auth.login("owner@example.com", "initial-admin-password")[0]
    with pytest.raises(ResourceConflict):
        runtime.account_deletion.request(owner)
    runtime.account_deletion.sender.send.assert_not_called()
    actor, _ = user(runtime)
    failed = Future()
    failed.set_exception(EmailUnavailableError("smtp failed"))
    runtime.account_deletion.sender.send.return_value = failed
    with pytest.raises(EmailUnavailableError):
        runtime.account_deletion.request(actor)
    assert not runtime.account_deletion.code_repository.redis.exists(runtime.account_deletion.code_repository.key(actor.email))
    done = Future()
    done.set_result(None)
    runtime.account_deletion.sender.send.return_value = done
    runtime.account_deletion.request(actor)
    runtime.account_deletion.confirm(actor, "12345678")
