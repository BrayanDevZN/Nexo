from threading import Event
from unittest.mock import Mock

import pytest

from backend.infra.connections.email import (
    EmailQueueFullError,
    EmailUnavailableError,
    GmailConnection,
)


def sender(settings, monkeypatch):
    settings.email = "sender@example.com"
    from pydantic import SecretStr
    settings.password = SecretStr("smtp-sentinel")
    smtp = Mock()
    monkeypatch.setattr("backend.infra.connections.email.yagmail.SMTP", Mock(return_value=smtp))
    return GmailConnection(settings), smtp


def test_delivers_and_closes_smtp(settings, monkeypatch):
    connection, smtp = sender(settings, monkeypatch)
    try:
        connection.send("receiver@example.com", "Nexo", "/etc/passwd").result(timeout=5)
        smtp.send.assert_called_once()
        assert type(smtp.send.call_args.kwargs["contents"]).__name__ == "raw"
        smtp.close.assert_called_once()
    finally:
        connection.close()
    with pytest.raises(EmailUnavailableError):
        connection.send("receiver@example.com", "Nexo", "text")


def test_failed_send_propagates_sanitized_error_and_releases_slot(settings, monkeypatch):
    connection, smtp = sender(settings, monkeypatch)
    smtp.send.side_effect = RuntimeError("smtp-sentinel")
    try:
        with pytest.raises(EmailUnavailableError, match="Gmail delivery failed") as error:
            connection.send("receiver@example.com", "Nexo", "body").result(timeout=5)
        assert "smtp-sentinel" not in str(error.value)
        smtp.close.assert_called_once()
    finally:
        connection.close()


def test_queue_capacity_and_shutdown(settings, monkeypatch):
    settings.email_queue_limit = 1
    connection, smtp = sender(settings, monkeypatch)
    entered, release = Event(), Event()
    def blocked_send(**kwargs):
        entered.set()
        assert release.wait(timeout=5)
    smtp.send.side_effect = blocked_send
    try:
        future = connection.send("receiver@example.com", "Nexo", "body")
        assert entered.wait(timeout=5)
        with pytest.raises(EmailQueueFullError):
            connection.send("receiver@example.com", "Nexo", "body")
        release.set()
        future.result(timeout=5)
    finally:
        release.set()
        connection.close()


def test_unconfigured_gmail_does_not_connect(settings):
    connection = GmailConnection(settings)
    try:
        with pytest.raises(EmailUnavailableError):
            connection.send("receiver@example.com", "Nexo", "body")
    finally:
        connection.close()
