from concurrent.futures import Future
from types import SimpleNamespace
from unittest.mock import MagicMock, Mock

import pytest

from backend.infra.connections.email import EmailUnavailableError
from backend.service.account_deletion import AccountDeletionService, DeletionCodeError


def service():
    repos = MagicMock()
    actor = SimpleNamespace(id="member", email="ana@example.com", session_version=0, status="pending")
    db = repos.transaction.return_value.__enter__.return_value
    db.users.get.return_value = actor
    db.users.principal_admin.return_value = None
    done = Future()
    done.set_result(None)
    mail = Mock(configured=True, send=Mock(return_value=done))
    codes = Mock()
    codes.create.return_value = "12345678"
    codes.digest.return_value = "hmac-digest"
    repository = Mock(ttl=600)
    return AccountDeletionService(repos, Mock(), codes, repository, mail), actor


def test_issuer_binds_code_to_user_and_version_and_only_stores_digest():
    deletion, actor = service()
    deletion.request(actor)
    deletion.code_repository.issue.assert_called_once_with(actor.email, "hmac-digest",
                                                          {"user_id": actor.id, "version": 0})
    assert deletion.sender.send.call_args.args[0] == actor.email
    deletion.members.remove_self.assert_not_called()


@pytest.mark.parametrize("record", [None, {"user_id": "other", "version": 0},
                                   {"user_id": "member", "version": 1}])
def test_invalid_or_unbound_confirmation_never_deletes(record):
    deletion, actor = service()
    deletion.code_repository.consume.return_value = record
    with pytest.raises(DeletionCodeError):
        deletion.confirm(actor, "12345678")
    deletion.members.remove_self.assert_not_called()


def test_smtp_failure_does_not_claim_success_and_invalidates_code():
    deletion, actor = service()
    done = Future()
    done.set_exception(EmailUnavailableError("smtp failed"))
    deletion.sender.send.return_value = done
    with pytest.raises(EmailUnavailableError):
        deletion.request(actor)
    deletion.code_repository.remove.assert_called_once_with(actor.email, "hmac-digest")
    deletion.members.remove_self.assert_not_called()
