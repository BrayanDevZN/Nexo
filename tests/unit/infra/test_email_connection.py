from threading import Event
from unittest.mock import Mock

import httpx
import pytest
from pydantic import SecretStr

from backend.infra.connections.email import (
    EmailQueueFullError,
    EmailUnavailableError,
    ResendConnection,
)


def sender(settings, monkeypatch):
    settings.email = "sender@example.com"
    settings.resend_from = "verified@example.com"
    settings.resend_key = SecretStr("resend-sentinel")
    client = Mock()
    client.post.return_value = httpx.Response(200, json={"id": "email-id"})
    monkeypatch.setattr("backend.infra.connections.email.httpx.Client", Mock(return_value=client))
    return ResendConnection(settings), client


def test_delivers_and_closes_http_client(settings, monkeypatch):
    connection, client = sender(settings, monkeypatch)
    try:
        connection.send("receiver@example.com", "Nexo", "/etc/passwd").result(timeout=5)
        client.post.assert_called_once_with("/emails", json={
            "from": "verified@example.com", "to": ["receiver@example.com"],
            "subject": "Nexo", "text": "/etc/passwd",
        })
    finally:
        connection.close()
    client.close.assert_called_once()
    with pytest.raises(EmailUnavailableError):
        connection.send("receiver@example.com", "Nexo", "text")


def test_failed_send_propagates_sanitized_error_and_releases_slot(settings, monkeypatch):
    connection, client = sender(settings, monkeypatch)
    client.post.side_effect = RuntimeError("resend-sentinel")
    try:
        with pytest.raises(EmailUnavailableError, match="Resend delivery failed") as error:
            connection.send("receiver@example.com", "Nexo", "body").result(timeout=5)
        assert "resend-sentinel" not in str(error.value)
    finally:
        connection.close()


def test_queue_capacity_and_shutdown(settings, monkeypatch):
    settings.email_queue_limit = 1
    connection, client = sender(settings, monkeypatch)
    entered, release = Event(), Event()

    def blocked_send(path, **kwargs):
        entered.set()
        assert release.wait(timeout=5)
        return httpx.Response(200, json={"id": "email-id"})

    client.post.side_effect = blocked_send
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


def test_unconfigured_resend_does_not_connect(settings):
    settings.email = "sender@example.com"
    settings.resend_key = None
    connection = ResendConnection(settings)
    try:
        with pytest.raises(EmailUnavailableError):
            connection.send("receiver@example.com", "Nexo", "body")
    finally:
        connection.close()


@pytest.mark.parametrize("kind,category,code", [("auth", "authentication", 401),
                                                ("timeout", "network", None)])
def test_failure_logs_category_without_credentials(settings, monkeypatch, caplog, kind, category, code):
    connection, client = sender(settings, monkeypatch)
    def failing_post(path, **kwargs):
        if kind == "auth":
            return httpx.Response(401)
        raise httpx.TimeoutException("resend-sentinel")
    client.post.side_effect = failing_post
    try:
        with pytest.raises(EmailUnavailableError) as error:
            connection.send("receiver@example.com", "Nexo", "private-code").result(timeout=5)
        assert error.value.category == category and error.value.smtp_code == code
    finally:
        connection.close()
    assert "category=" + category in caplog.text
    assert not any(secret in caplog.text for secret in ["resend-sentinel", "receiver@example.com", "private-code"])
