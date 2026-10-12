from threading import Event
from unittest.mock import Mock

import httpx
import jwt
import pytest
from pydantic import SecretStr

from backend.infra.connections.email import (
    INCREMENT_RESEND_COUNTER,
    MARK_RESEND_QUOTA_EXHAUSTED,
    EmailQueueFullError,
    EmailUnavailableError,
    ResendConnection,
)


def sender(settings, monkeypatch):
    settings.email = "sender@example.com"
    settings.resend_from = "verified@example.com"
    settings.resend_key = SecretStr("resend-sentinel")
    client = Mock()
    n8n_client = Mock()
    client.post.return_value = httpx.Response(200, json={"id": "email-id"})
    monkeypatch.setattr("backend.infra.connections.email.httpx.Client",
                        Mock(side_effect=[client, n8n_client]))
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


def test_html_is_sent_alongside_text_fallback(settings, monkeypatch):
    connection, client = sender(settings, monkeypatch)
    try:
        connection.send(
            "receiver@example.com", "Nexo", "plain text",
            html="<html><body><table><tr><td>Olá</td></tr></table></body></html>",
        ).result(timeout=5)
        client.post.assert_called_once_with("/emails", json={
            "from": "verified@example.com", "to": ["receiver@example.com"],
            "subject": "Nexo", "text": "plain text",
            "html": "<html><body><table><tr><td>Olá</td></tr></table></body></html>",
        })
    finally:
        connection.close()


def test_switches_from_resend_to_n8n_after_seventy_and_sends_contract(settings, monkeypatch):
    from unittest.mock import Mock

    from pydantic import SecretStr

    settings.email = "sender@example.com"
    settings.resend_from = "verified@example.com"
    settings.resend_key = SecretStr("resend-sentinel")
    settings.url_email_n8n = "https://n8n.example.com/webhook/email"
    settings.secret_email_n8n = SecretStr("jwt-sentinel")
    resend, n8n, redis = Mock(), Mock(), Mock()
    resend.post.return_value = httpx.Response(200, json={"id": "resend-id"})
    n8n.post.side_effect = [httpx.Response(200, json={"ok": True}),
                           httpx.Response(200, json={"ok": True})]
    redis.eval.side_effect = [70, 71, 72]
    monkeypatch.setattr("backend.infra.connections.email.httpx.Client", Mock(side_effect=[resend, n8n]))
    connection = ResendConnection(settings, redis_client=redis)
    try:
        connection.send("receiver@example.com", "First", "plain").result(timeout=5)
        connection.send("receiver@example.com", "Second", "plain", html="<p>html</p>").result(timeout=5)
        connection.send("receiver@example.com", "Third", "plain").result(timeout=5)
        resend.post.assert_called_once_with("/emails", json={
            "from": "verified@example.com", "to": ["receiver@example.com"],
            "subject": "First", "text": "plain",
        })
        assert n8n.post.call_args_list[0].args == (settings.url_email_n8n,)
        first_token = n8n.post.call_args_list[0].kwargs["headers"]["Authorization"].removeprefix("Bearer ")
        first_claims = jwt.decode(first_token, "jwt-sentinel", algorithms=["HS256"])
        assert first_claims["exp"] - first_claims["iat"] == 3600
        assert n8n.post.call_args_list[0].kwargs["json"] == {
            "to": "receiver@example.com", "type": "html", "subject": "Second", "content": "<p>html</p>",
        }
        assert n8n.post.call_args_list[1].kwargs["json"] == {
            "to": "receiver@example.com", "type": "text", "subject": "Third", "content": "plain",
        }
        assert all(args[0] == INCREMENT_RESEND_COUNTER
                   for args in (call.args for call in redis.eval.call_args_list))
    finally:
        connection.close()


def test_redis_quota_failure_does_not_send_email(settings, monkeypatch):
    from unittest.mock import Mock

    settings.email = "sender@example.com"
    settings.resend_key = SecretStr("resend-sentinel")
    resend, n8n, redis = Mock(), Mock(), Mock()
    redis.eval.side_effect = RuntimeError("redis unavailable")
    monkeypatch.setattr("backend.infra.connections.email.httpx.Client", Mock(side_effect=[resend, n8n]))
    connection = ResendConnection(settings, redis_client=redis)
    try:
        with pytest.raises(EmailUnavailableError, match="quota counter") as error:
            connection.send("receiver@example.com", "Subject", "Body").result(timeout=5)
        assert error.value.category == "quota_counter"
        resend.post.assert_not_called()
        n8n.post.assert_not_called()
    finally:
        connection.close()


def test_resend_429_marks_quota_exhausted_and_retries_through_n8n(settings, monkeypatch):
    from unittest.mock import Mock

    settings.email = "sender@example.com"
    settings.resend_from = "verified@example.com"
    settings.resend_key = SecretStr("resend-sentinel")
    settings.url_email_n8n = "https://n8n.example.com/webhook/email"
    settings.secret_email_n8n = SecretStr("jwt-sentinel")
    resend, n8n, redis = Mock(), Mock(), Mock()
    resend.post.return_value = httpx.Response(429, request=httpx.Request("POST", "https://api.resend.com/emails"))
    n8n.post.return_value = httpx.Response(200, json={"ok": True})
    redis.eval.side_effect = [1, 71]
    monkeypatch.setattr("backend.infra.connections.email.httpx.Client", Mock(side_effect=[resend, n8n]))
    connection = ResendConnection(settings, redis_client=redis)
    try:
        result = connection.send("receiver@example.com", "Subject", "Body").result(timeout=5)

        assert result == {"ok": True}
        resend.post.assert_called_once()
        token = n8n.post.call_args.kwargs["headers"]["Authorization"].removeprefix("Bearer ")
        claims = jwt.decode(token, "jwt-sentinel", algorithms=["HS256"])
        assert claims["exp"] - claims["iat"] == 3600
        n8n.post.assert_called_once_with(
            settings.url_email_n8n,
            headers=n8n.post.call_args.kwargs["headers"],
            json={"to": "receiver@example.com", "type": "text", "subject": "Subject", "content": "Body"},
        )
        assert redis.eval.call_args_list[1].args[0] == MARK_RESEND_QUOTA_EXHAUSTED
    finally:
        connection.close()
