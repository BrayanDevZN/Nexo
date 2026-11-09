from types import SimpleNamespace
from unittest.mock import Mock

import pytest

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


def test_maps_results_email_lists_leads_escapes_content_and_links_to_the_search():
    sender = Mock(configured=True)
    message = AccountMessages(sender)
    leads = [{"title": "<b>Padaria</b>", "phone": "+5511911111111", "address": "Rua A, 1"}]
    message.maps_results(SimpleNamespace(email="ana@example.com", name="Ana"), "job-1", "Padarias", 3, 1, leads)
    args, kwargs = sender.send.call_args
    assert args[0] == "ana@example.com" and "Padarias" in args[1]
    assert "&lt;b&gt;Padaria&lt;/b&gt;" in kwargs["html"] and "<b>Padaria</b>" not in kwargs["html"]
    assert "3 empresa(s) nova(s); 1 já estavam no funil" in args[2] and "e mais 2 no painel" in args[2]
    assert "/admin?maps=job-1" in args[2] and "/admin?maps=job-1" in kwargs["html"]


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


@pytest.mark.parametrize(
    ("method_name", "eyebrow", "heading"),
    [
        ("registration_code", "SEGURANÇA DA CONTA", "Confirme seu cadastro"),
        ("recovery_code", "SEGURANÇA DA CONTA", "Redefina sua senha"),
        ("deletion_code", "SEGURANÇA DA CONTA", "Confirme a exclusão da conta"),
    ],
)
def test_security_emails_share_the_branded_code_layout(method_name, eyebrow, heading):
    sender = Mock(configured=True)
    getattr(AccountMessages(sender), method_name)("ana@example.com", "12345678", 600)

    _, kwargs = sender.send.call_args
    rendered = kwargs["html"]
    assert "#6d28d9" in rendered
    assert eyebrow in rendered
    assert heading in rendered
    assert "12345678" in rendered
    assert "600 segundos" in rendered
    assert "role=\"presentation\"" in rendered
    assert 'src="https://raw.githubusercontent.com/BrayanDevZN/Nexo/main/src/frontend/public/images/nexo-symbol-purple.png"' in rendered
    assert 'alt="Símbolo da Nexo"' in rendered


def test_automation_invitation_has_a_branded_action_button_and_plain_text_link():
    sender = Mock(configured=True)
    user = SimpleNamespace(email="ana@example.com", name="Ana")
    invite = "https://n8n.nexoaicompany.com/invite/example-token"

    assert AccountMessages(sender).automation_invitation(user, invite, "Acesso aprovado.") is True

    args, kwargs = sender.send.call_args
    assert args[0] == user.email
    assert "Criar minha conta no n8n: " + invite in args[2]
    assert "AUTOMAÇÕES" in kwargs["html"]
    assert 'href="' + invite + '"' in kwargs["html"]
    assert "Acesso aprovado." in kwargs["html"]
