from concurrent.futures import Future
from unittest.mock import MagicMock, Mock

import pytest

from backend.infra.connections.email import EmailUnavailableError
from backend.service.registration import RegistrationCodeError, RegistrationService


def test_request_stores_only_password_hash_and_defers_user_creation():
    auth = Mock()
    auth.repositories.transaction = MagicMock()
    auth.repositories.transaction.return_value.__enter__.return_value.users.by_email.return_value = None
    auth.passwords.hash.return_value = "bcrypt-hash"
    codes = Mock()
    codes.create.return_value = "12345678"
    codes.digest.return_value = "digest"
    repo = Mock(ttl=600)
    repo.issue.return_value = True
    done = Future()
    done.set_result(None)
    sender = Mock(configured=True)
    sender.send.return_value = done
    service = RegistrationService(auth, codes, repo, sender)
    service.request(
        name="Ana", email="ANA@example.com", phone="11999999999", password="secret-password"
    )
    auth.register.assert_not_called()
    stored = repo.issue.call_args.args[2]
    assert stored["password_hash"] == "bcrypt-hash" and "password" not in stored
    assert stored["email"] == "ana@example.com"
    assert "12345678" in sender.send.call_args.args[2]


def test_invalid_code_never_creates_account():
    auth, codes, repo, sender = Mock(), Mock(), Mock(), Mock()
    repo.consume.return_value = None
    with pytest.raises(RegistrationCodeError):
        RegistrationService(auth, codes, repo, sender).confirm("ana@example.com", "12345678")
    auth.register.assert_not_called()


def test_failed_delivery_invalidates_pending_code():
    auth = Mock()
    auth.repositories.transaction = MagicMock()
    auth.repositories.transaction.return_value.__enter__.return_value.users.by_email.return_value = None
    codes, repo = Mock(), Mock(ttl=600)
    codes.create.return_value = "12345678"
    failed = Future()
    failed.set_exception(EmailUnavailableError("Failed"))
    sender = Mock(configured=True)
    sender.send.return_value = failed
    with pytest.raises(EmailUnavailableError):
        RegistrationService(auth, codes, repo, sender).request(
            name="Ana", email="ana@example.com", phone="11999999999", password="secret-password"
        )
    repo.remove.assert_called_once()


def test_delivery_timeout_does_not_report_success():
    auth = MagicMock()
    auth.repositories.transaction.return_value.__enter__.return_value.users.by_email.return_value = None
    codes, repo = Mock(), Mock(ttl=600)
    codes.create.return_value = "12345678"
    sender = Mock(configured=True, send=Mock(return_value=Future()))
    with pytest.raises(EmailUnavailableError):
        RegistrationService(auth, codes, repo, sender, delivery_timeout=.001).request(
            name="Ana", email="ana@example.com", phone="11999999999", password="secret-password")
    repo.remove.assert_called_once()
    auth.register.assert_not_called()
