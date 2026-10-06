from unittest.mock import Mock

import pytest
from pydantic import SecretStr

from backend.domain.passwords import PasswordHasher
from backend.service.access import AccessDenied, ResourceConflict
from backend.service.runtime import RuntimeServices
from backend.service.security import AuthenticationError


@pytest.fixture
def runtime(settings, local_redis_url, monkeypatch, tmp_path):
    settings.redis_url = SecretStr(local_redis_url)
    settings.upload_dir = tmp_path / "photos"
    settings.email = "owner@example.com"
    settings.password = SecretStr("initial-admin-password")
    monkeypatch.setattr("backend.service.runtime.PasswordHasher", lambda: PasswordHasher(rounds=4))
    service = RuntimeServices(settings)
    service.initialize(settings)
    yield service
    service.close()


def owner(runtime):
    return runtime.auth.login("owner@example.com", "initial-admin-password")[0]


def registered(runtime, *, approved=True):
    user = runtime.auth.register(name="Ana", email="ana@example.com", phone="11999999999",
                                 password="strong-password-123")
    if approved:
        actor = owner(runtime)
        note = runtime.approvals.notifications(actor)[0]
        runtime.approvals.decide(actor, note["id"], "approved")
    return runtime.auth.login(user.email, "strong-password-123")


def test_promotion_demotion_refresh_cache_and_revoke_old_sessions(runtime):
    actor = owner(runtime)
    user, token = registered(runtime)
    assert next(row for row in runtime.members.users(actor) if row["id"] == user.id)["role"] == "member"
    with pytest.raises(AccessDenied):
        runtime.members.users(user)
    updated = runtime.members.update(actor, user.id, {"role": "admin"})
    assert updated["role"] == "admin" and not updated["is_principal"]
    with pytest.raises(AuthenticationError):
        runtime.sessions.authenticate(token)
    promoted, token = runtime.auth.login(user.email, "strong-password-123")
    assert len(runtime.members.users(promoted)) == 2
    assert next(row for row in runtime.members.users(actor) if row["id"] == user.id)["role"] == "admin"
    runtime.members.update(actor, user.id, {"role": "member"})
    with pytest.raises(AccessDenied):
        runtime.members.users(promoted)
    with pytest.raises(AuthenticationError):
        runtime.sessions.authenticate(token)


def test_principal_identity_and_self_protection(runtime):
    actor = owner(runtime)
    user, _ = registered(runtime)
    runtime.members.update(actor, user.id, {"role": "admin"})
    second, _ = runtime.auth.login(user.email, "strong-password-123")
    for caller in (actor, second):
        with pytest.raises(ResourceConflict):
            runtime.members.delete(caller, actor.id)
        with pytest.raises(ResourceConflict):
            runtime.members.update(caller, actor.id, {"email": "different@example.com"})
        with pytest.raises(ResourceConflict):
            runtime.members.update(caller, actor.id, {"role": "member"})
    with pytest.raises(ResourceConflict):
        runtime.members.delete(second, second.id)
    with pytest.raises(ResourceConflict):
        runtime.members.update(second, second.id, {"role": "member"})
    with runtime.repositories.transaction() as repos:
        # Even when another administrator predates the principal, EMAIL determines ownership.
        from datetime import datetime
        repos.users.get(second.id).created_at = datetime(2000, 1, 1)
        assert repos.users.principal_admin().id == actor.id
    assert runtime.members.update(second, actor.id, {"name": "Owner edited"})["name"] == "Owner edited"


def test_pending_role_and_duplicate_email_are_rejected_atomically(runtime):
    actor = owner(runtime)
    user, token = registered(runtime, approved=False)
    with pytest.raises(ResourceConflict):
        runtime.members.update(actor, user.id, {"role": "admin"})
    with pytest.raises(ResourceConflict):
        runtime.members.update(actor, user.id, {"name": "Changed", "email": actor.email})
    with runtime.repositories.transaction() as repos:
        unchanged = repos.users.get(user.id)
        assert unchanged.name == "Ana" and unchanged.email == user.email and unchanged.role == "member"
    assert runtime.sessions.authenticate(token).id == user.id


def test_deletion_preserves_clients_cleans_notifications_and_invalidates_cache(runtime):
    actor = owner(runtime)
    user, token = registered(runtime)
    client = runtime.clients.create(user, name="Loja", niche="Varejo", contract_closed=True)
    runtime.members.users(actor)
    runtime.clients.list(actor)
    assert len(runtime.approvals.notifications(actor)) == 1
    photo = runtime.profiles.storage.write(b"test-photo")
    with runtime.repositories.transaction() as repos:
        repos.users.get(user.id).profile_photo = photo
    runtime.members.delete(actor, user.id)
    assert [row["id"] for row in runtime.members.users(actor)] == [actor.id]
    assert runtime.approvals.notifications(actor) == []
    assert runtime.clients.get(actor, client.id)["created_by_id"] == actor.id
    with pytest.raises(FileNotFoundError):
        runtime.profiles.storage.read(photo)
    with pytest.raises(AuthenticationError):
        runtime.sessions.authenticate(token)
    with runtime.repositories.transaction() as repos:
        assert repos.users.get(user.id) is None
        assert repos.clients.get(client.id).created_by_id == actor.id


def test_deletion_failure_rolls_back_transfers_and_does_not_remove_photo(runtime, monkeypatch):
    actor = owner(runtime)
    user, token = registered(runtime)
    client = runtime.clients.create(user, name="Loja", niche="Varejo", contract_closed=False)
    runtime.profiles.cleanup_photo = Mock()
    monkeypatch.setattr("backend.repository.db.control.users.UserRepository.delete",
                        Mock(side_effect=RuntimeError("delete failure")))
    with pytest.raises(RuntimeError):
        runtime.members.delete(actor, user.id)
    runtime.profiles.cleanup_photo.assert_not_called()
    assert runtime.sessions.authenticate(token).id == user.id
    assert runtime.clients.get(actor, client.id)["created_by_id"] == user.id
    assert len(runtime.approvals.notifications(actor)) == 1


def test_shared_directory_uses_allowlist_approval_and_fresh_authorization(runtime):
    actor = owner(runtime)
    user, token = registered(runtime, approved=False)
    with pytest.raises(AccessDenied):
        runtime.members.directory(user)
    before = runtime.members.directory(actor)
    assert [row["id"] for row in before] == [actor.id]
    note = runtime.approvals.notifications(actor)[0]
    runtime.approvals.decide(actor, note["id"], "approved")
    approved = runtime.sessions.authenticate(token)
    rows = runtime.members.directory(approved)
    assert {row["id"] for row in rows} == {actor.id, user.id}
    assert all(set(row) == {"id", "name", "role", "has_photo"} for row in rows)
    assert len(runtime.members.directory(approved, limit=1, offset=1)) == 1
    runtime.members.update(actor, user.id, {"name": "Ana Edited"})
    assert next(row for row in runtime.members.directory(approved) if row["id"] == user.id)["name"] == "Ana Edited"
    runtime.sessions.revoke_all(user.id)
    with pytest.raises(AccessDenied):
        runtime.members.directory(approved)
