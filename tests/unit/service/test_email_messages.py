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


def test_announcement_html_escapes_user_content_and_has_plain_text_fallback():
    sender = Mock(configured=True)
    message = AccountMessages(sender)
    message.announcement(
        SimpleNamespace(email="ana@example.com"),
        "<script>title</script>",
        "Linha 1\n<img src=x onerror=alert(1)>",
    )
    sender.send.assert_called_once()
    args, kwargs = sender.send.call_args
    assert args[0] == "ana@example.com"
    assert "<script>" not in kwargs["html"]
    assert "&lt;script&gt;title&lt;/script&gt;" in kwargs["html"]
    assert "&lt;img src=x onerror=alert(1)&gt;" in kwargs["html"]
    assert "Linha 1" in args[2]


def test_access_decision_sends_branded_html_and_panel_link():
    sender = Mock(configured=True)
    user = SimpleNamespace(email="ana@example.com", name="Ana")
    assert AccountMessages(sender).access_decision(user, "approved") is True
    args, kwargs = sender.send.call_args
    assert args[0] == user.email
    assert args[1] == "Seu acesso à Nexo foi aprovado"
    assert "Acesso aprovado" in kwargs["html"]
    assert "https://www.nexoaicompany.com/admin" in kwargs["html"]


def test_rejection_is_emailed_without_an_access_button():
    sender = Mock(configured=True)
    user = SimpleNamespace(email="ana@example.com", name="Ana")
    assert AccountMessages(sender).access_decision(user, "rejected") is True
    args, kwargs = sender.send.call_args
    assert args[1] == "Atualização sobre seu acesso à Nexo"
    assert "Acesso não aprovado" in kwargs["html"]
    assert "Acessar o painel" not in kwargs["html"]
