from types import SimpleNamespace
from unittest.mock import Mock

from backend.infra.connections.email import EmailQueueFullError
from backend.service.email_messages import AccountMessages


def test_welcome_queue_failure_does_not_expose_recipient(caplog):
    sender = Mock(configured=True)
    sender.send.side_effect = EmailQueueFullError("synthetic overload")
    AccountMessages(sender).welcome(SimpleNamespace(email="private@example.com"))
    assert "private@example.com" not in caplog.text
    assert "could not be queued" in caplog.text


def test_welcome_without_credentials_is_optional():
    sender = Mock(configured=False)
    AccountMessages(sender).welcome(SimpleNamespace(email="ana@example.com"))
    sender.send.assert_not_called()
