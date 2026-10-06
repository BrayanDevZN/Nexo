import html
import logging

from backend.infra.connections.email import EmailQueueFullError, EmailUnavailableError

logger = logging.getLogger(__name__)

_BACKGROUND = "#f4f4f5"
_FOREGROUND = "#18181b"
_MUTED = "#71717a"
_BORDER = "#e4e4e7"
_PRIMARY = "#4f46e5"


def _paragraph(value: str) -> str:
    return html.escape(value, quote=True).replace("\n", "<br>")


def _render_email(*, preheader: str, heading: str, paragraphs: list[str],
                  code: str | None = None, expires_in: int | None = None,
                  action_label: str | None = None, action_url: str | None = None) -> str:
    """Gmail-friendly one-column HTML: tables, inline CSS, no remote assets."""
    safe_preheader = html.escape(preheader, quote=True)
    safe_heading = html.escape(heading, quote=True)
    body = "".join(
        '<tr><td style="padding:0 0 14px;color:#3f3f46;font:15px/1.65 Arial,Helvetica,sans-serif;">'
        + _paragraph(paragraph) + "</td></tr>"
        for paragraph in paragraphs
    )
    code_block = ""
    if code is not None:
        safe_code = html.escape(code, quote=True)
        expiry = (f'<div style="padding-top:8px;color:{_MUTED};font:12px/1.5 Arial,Helvetica,sans-serif;">'
                  f'Este código expira em {int(expires_in or 0)} segundos.</div>')
        code_block = (
            '<tr><td style="padding:4px 0 22px;">'
            f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" '
            f'style="border:1px solid {_BORDER};border-radius:12px;background:#fafafa;"><tr><td align="center" '
            f'style="padding:20px 12px;color:{_FOREGROUND};font:bold 30px/1.2 Arial,Helvetica,sans-serif;'
            f'letter-spacing:8px;">{safe_code}</td></tr></table>{expiry}</td></tr>'
        )
    action = ""
    if action_label and action_url:
        safe_label = html.escape(action_label, quote=True)
        safe_url = html.escape(action_url, quote=True)
        action = (
            '<tr><td align="left" style="padding:2px 0 22px;">'
            f'<a href="{safe_url}" style="display:inline-block;border-radius:8px;background:{_PRIMARY};'
            f'padding:12px 18px;color:#ffffff;text-decoration:none;font:bold 14px Arial,Helvetica,sans-serif;">'
            f'{safe_label}</a></td></tr>'
        )
    return (
        '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1"></head>'
        f'<body style="margin:0;padding:0;background:{_BACKGROUND};">'
        f'<div style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;'
        f'overflow:hidden;mso-hide:all;">{safe_preheader}</div>'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        f'style="background:{_BACKGROUND};"><tr><td align="center" style="padding:32px 12px;">'
        '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" '
        'style="width:100%;max-width:600px;border:1px solid #e4e4e7;border-radius:16px;background:#ffffff;">'
        '<tr><td style="padding:26px 28px 18px;border-bottom:1px solid #e4e4e7;">'
        f'<div style="color:{_PRIMARY};font:bold 13px/1.4 Arial,Helvetica,sans-serif;letter-spacing:2px;">NEXO</div>'
        '<div style="padding-top:4px;color:#71717a;font:12px/1.5 Arial,Helvetica,sans-serif;">Painel da equipe</div>'
        '</td></tr><tr><td style="padding:28px;">'
        f'<div style="padding-bottom:8px;color:{_PRIMARY};font:bold 11px/1.4 Arial,Helvetica,sans-serif;'
        f'letter-spacing:1.4px;text-transform:uppercase;">Atualização da Nexo</div>'
        f'<h1 style="margin:0 0 18px;color:{_FOREGROUND};font:bold 25px/1.25 Arial,Helvetica,sans-serif;">'
        f'{safe_heading}</h1><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
        f'{body}{code_block}{action}</table>'
        f'<div style="border-top:1px solid {_BORDER};padding-top:16px;color:{_MUTED};'
        'font:12px/1.6 Arial,Helvetica,sans-serif;">Esta mensagem foi enviada pela Nexo. '
        'Se você não reconhece esta solicitação, pode ignorar este e-mail.</div>'
        '</td></tr></table></td></tr></table></body></html>'
    )


class AccountMessages:
    def __init__(self, sender):
        self.sender = sender
        self.frontend_url = getattr(getattr(sender, "settings", None), "frontend_url",
                                    "https://www.nexoaicompany.com")

    def _send(self, recipient, subject, preheader, heading, paragraphs, *, code=None,
              expires_in=None, action_label=None, action_url=None):
        plain_parts = list(paragraphs)
        if code is not None:
            plain_parts.append("Código: " + str(code))
            plain_parts.append("Este código expira em " + str(expires_in) + " segundos.")
        if action_label and action_url:
            plain_parts.append(action_label + ": " + action_url)
        plain_parts.append("Esta mensagem foi enviada pela Nexo.")
        return self.sender.send(
            recipient, subject, "\n\n".join(plain_parts),
            html=_render_email(preheader=preheader, heading=heading, paragraphs=paragraphs,
                               code=code, expires_in=expires_in,
                               action_label=action_label, action_url=action_url),
        )

    def registration_code(self, recipient, code, expires_in):
        return self._send(
            recipient, "Código para confirmar seu cadastro na Nexo",
            "Confirme seu endereço de e-mail para concluir o cadastro.",
            "Confirme seu cadastro",
            ["Use o código abaixo para confirmar seu endereço de e-mail e continuar o cadastro da sua conta Nexo."],
            code=code, expires_in=expires_in,
        )

    def recovery_code(self, recipient, code, expires_in):
        return self._send(
            recipient, "Código para atualizar sua senha Nexo",
            "Use seu código para criar uma nova senha.",
            "Redefina sua senha",
            ["Use o código abaixo para confirmar a solicitação de troca de senha."],
            code=code, expires_in=expires_in,
        )

    def deletion_code(self, recipient, code, expires_in):
        return self._send(
            recipient, "Confirme a exclusão da sua conta Nexo",
            "Confirme a solicitação de exclusão da sua conta.",
            "Confirme a exclusão da conta",
            ["Use o código abaixo para confirmar a exclusão da sua conta Nexo."],
            code=code, expires_in=expires_in,
        )

    def welcome(self, user):
        if not self.sender.configured:
            return
        try:
            self._send(
                user.email, "Cadastro Nexo recebido",
                "Recebemos seu cadastro e ele aguarda aprovação.",
                "Seu cadastro foi recebido",
                ["Olá, " + user.name + ". Seu cadastro foi recebido e aguarda aprovação do administrador.",
                 "Você receberá outro e-mail assim que a decisão sobre seu acesso for registrada."],
            )
        except (EmailUnavailableError, EmailQueueFullError):
            # The committed account survives failures in best-effort welcome delivery.
            logger.warning("Welcome email could not be queued")

    def access_decision(self, user, decision: str):
        if not self.sender.configured:
            return False
        approved = decision == "approved"
        if approved:
            subject = "Seu acesso à Nexo foi aprovado"
            preheader = "Você já pode entrar no painel da Nexo."
            heading = "Acesso aprovado"
            paragraphs = ["Olá, " + user.name + ". Seu acesso ao painel da Nexo foi aprovado.",
                          "Entre com sua conta para começar a usar o espaço da equipe."]
            action_label = "Acessar o painel"
        else:
            subject = "Atualização sobre seu acesso à Nexo"
            preheader = "Há uma atualização sobre sua solicitação de acesso."
            heading = "Acesso não aprovado"
            paragraphs = ["Olá, " + user.name + ". Sua solicitação de acesso ao painel da Nexo não foi aprovada.",
                          "Se você acredita que isso aconteceu por engano, fale com o administrador da equipe."]
            action_label = None
        try:
            self._send(user.email, subject, preheader, heading, paragraphs,
                       action_label=action_label,
                       action_url=self.frontend_url.rstrip("/") + "/admin" if action_label else None)
        except (EmailUnavailableError, EmailQueueFullError):
            logger.warning("Access decision email could not be queued")
            return False
        return True

    def announcement(self, user, title: str, body: str):
        if not self.sender.configured:
            return False
        self._send(
            user.email, "Novo aviso da Nexo: " + title,
            "A equipe compartilhou um novo aviso.",
            title, [body],
        )
        return True
