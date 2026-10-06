from unittest.mock import Mock

import pytest
from pydantic import SecretStr

from backend.domain.passwords import PasswordHasher
from backend.service.approvals import ApprovalConflict, ApprovalPermissionError
from backend.service.runtime import RuntimeServices


@pytest.fixture
def runtime(settings, local_redis_url, monkeypatch):
    settings.redis_url = SecretStr(local_redis_url)
    settings.email = "owner@example.com"
    settings.password = SecretStr("initial-admin-password")
    monkeypatch.setattr("backend.service.runtime.PasswordHasher", lambda: PasswordHasher(rounds=4))
    service = RuntimeServices(settings)
    service.initialize(settings)
    yield service
    service.close()


def register(runtime):
    return runtime.auth.register(name="Ana", email="ana@example.com", phone="11999999999",
                                 password="strong-password-123")


def admin(runtime):
    return runtime.auth.login("owner@example.com", "initial-admin-password")[0]


def test_approval_transaction_activates_session_and_invalidates_cached_lists(runtime):
    user = register(runtime)
    _, token = runtime.auth.login(user.email, "strong-password-123")
    actor = admin(runtime)
    assert runtime.approvals.users(actor, status="pending")[0]["id"] == user.id
    notes = runtime.approvals.notifications(actor, unresolved_only=True)
    assert len(notes) == 1
    approved = runtime.approvals.decide(actor, notes[0]["id"], "approved")
    assert approved.status == "approved" and approved.session_version == 0
    assert runtime.approvals.users(actor, status="pending") == []
    assert runtime.approvals.notifications(actor, unresolved_only=True) == []
    assert runtime.sessions.authenticate(token).status == "approved"
    with pytest.raises(ApprovalConflict):
        runtime.approvals.decide(actor, notes[0]["id"], "rejected")
    with runtime.repositories.transaction() as repos:
        assert repos.users.get(user.id).status == "approved"
        assert repos.notifications.get(notes[0]["id"]).decision == "approved"


def test_registration_notification_failure_rolls_back_account(runtime, monkeypatch):
    monkeypatch.setattr("backend.repository.db.control.notifications.NotificationRepository.ensure_approval_request",
                        Mock(side_effect=RuntimeError("synthetic notification failure")))
    with pytest.raises(RuntimeError):
        register(runtime)
    with runtime.repositories.transaction() as repos:
        assert repos.users.by_email("ana@example.com") is None
        assert repos.notifications.list_for_recipient(admin(runtime).id) == []


def test_decision_failure_rolls_back_notification_and_version(runtime, monkeypatch):
    user = register(runtime)
    actor = admin(runtime)
    note = runtime.approvals.notifications(actor)[0]
    monkeypatch.setattr("backend.repository.db.control.users.UserRepository.decide_pending",
                        Mock(side_effect=RuntimeError("synthetic decision failure")))
    with pytest.raises(RuntimeError):
        runtime.approvals.decide(actor, note["id"], "approved")
    with runtime.repositories.transaction() as repos:
        assert repos.users.get(user.id).status == "pending"
        assert repos.users.get(user.id).session_version == 0
        assert repos.notifications.get(note["id"]).resolved_at is None


def test_startup_backfill_is_idempotent_and_read_is_preserved(runtime):
    with runtime.repositories.transaction() as repos:
        repos.users.create(name="Legacy", email="legacy@example.com", google_sub="legacy-google")
    runtime.approvals.synchronize_pending()
    runtime.approvals.synchronize_pending()
    actor = admin(runtime)
    notes = runtime.approvals.notifications(actor)
    assert len(notes) == 1
    read = runtime.approvals.mark_read(actor, notes[0]["id"])
    assert read["read_at"] is not None
    assert runtime.approvals.mark_read(actor, notes[0]["id"])["read_at"] == read["read_at"]
    runtime.approvals.decide(actor, notes[0]["id"], "rejected")
    assert runtime.approvals.notifications(actor)[0]["read_at"] == read["read_at"]


def test_service_denies_stale_admin_without_using_cached_authorization(runtime):
    actor = admin(runtime)
    runtime.approvals.users(actor)
    runtime.sessions.revoke_all(actor.id)
    with pytest.raises(ApprovalPermissionError):
        runtime.approvals.users(actor)


def test_concurrent_request_creation_does_not_duplicate_notifications(runtime):
    from concurrent.futures import ThreadPoolExecutor

    with runtime.repositories.transaction() as repos:
        user = repos.users.create(name="Legacy", email="legacy@example.com", google_sub="legacy-google")
    actor = admin(runtime)

    def create_request():
        with runtime.repositories.transaction() as repos:
            return repos.notifications.ensure_approval_request(recipient_id=actor.id,
                                                               requested_user_id=user.id)
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: create_request(), range(2)))
    assert sorted(results) == [False, True]
    assert len(runtime.approvals.notifications(actor)) == 1


def test_acceptance_and_rejection_send_email_after_decision(runtime, monkeypatch):
    user = register(runtime)
    actor = admin(runtime)
    note = runtime.approvals.notifications(actor)[0]
    send_email = Mock()
    monkeypatch.setattr(runtime.messages, "access_decision", send_email)

    result = runtime.approvals.decide(actor, note["id"], "approved")

    assert result.status == "approved"
    send_email.assert_called_once_with(user, "approved")
