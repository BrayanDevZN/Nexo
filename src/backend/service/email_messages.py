import html
import logging
from urllib.parse import urlencode

from backend.infra.connections.email import EmailQueueFullError, EmailUnavailableError

logger = logging.getLogger(__name__)

_BACKGROUND = "#f7f3fc"
_SURFACE = "#ffffff"
_FOREGROUND = "#21122f"
_BODY = "#51465f"
_MUTED = "#6f637c"
_BORDER = "#e8def3"
_PRIMARY = "#6d28d9"
_PRIMARY_SOFT = "#f2ebff"
_LOGO_URL = "https://raw.githubusercontent.com/BrayanDevZN/Nexo/main/src/frontend/public/images/nexo-symbol-purple.png"


def _paragraph(value: str) -> str:
    return html.escape(value, quote=True).replace("\n", "<br>")


def _render_email(*, preheader: str, heading: str, paragraphs: list[str],
                  code: str | None = None, expires_in: int | None = None,
                  action_label: str | None = None, action_url: str | None = None,
                  eyebrow: str = "PAINEL NEXO") -> str:
    """Render responsive, shadcn-inspired email HTML with inline styles and table layout."""
    safe_preheader = html.escape(preheader, quote=True)
    safe_heading = html.escape(heading, quote=True)
    safe_eyebrow = html.escape(eyebrow, quote=True)
    body = "".join(
        f'<tr><td style="padding:0 0 16px;color:{_BODY};font:15px/1.7 Arial,Helvetica,sans-serif;">'
        + _paragraph(paragraph) + "</td></tr>"
        for paragraph in paragraphs
    )
    code_block = ""
    if code is not None:
        safe_code = html.escape(code, quote=True)
        expiry = (
            '<tr><td align="center" style="padding:10px 8px 0;color:' + _MUTED +
            ';font:12px/1.5 Arial,Helvetica,sans-serif;">Este código expira em ' +
            str(int(expires_in or 0)) + ' segundos.</td></tr>'
        )
        code_block = (
            '<tr><td style="padding:4px 0 22px;">'
            f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" '
            f'style="border:1px solid {_BORDER};border-radius:12px;background:{_PRIMARY_SOFT};">'
            f'<tr><td align="center" style="padding:22px 12px;color:{_PRIMARY};'
            f'font:bold 30px/1.2 Arial,Helvetica,sans-serif;letter-spacing:8px;">{safe_code}</td></tr>'
            f'{expiry}</table></td></tr>'
        )
    action = ""
    if action_label and action_url:
        safe_label = html.escape(action_label, quote=True)
        safe_url = html.escape(action_url, quote=True)
        action = (
            '<tr><td align="left" style="padding:2px 0 24px;">'
            '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td '
            f'align="center" bgcolor="{_PRIMARY}" style="border-radius:8px;background:{_PRIMARY};">'
            f'<a href="{safe_url}" style="display:inline-block;padding:13px 20px;border:1px solid {_PRIMARY};'
            f'border-radius:8px;color:#ffffff;text-decoration:none;font:bold 14px/1 Arial,Helvetica,sans-serif;">'
            f'{safe_label}</a></td></tr></table></td></tr>'
        )
    return (
        '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1"></head>'
        f'<body style="margin:0;padding:0;background:{_BACKGROUND};">'
        '<div style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;'
        f'overflow:hidden;mso-hide:all;">{safe_preheader}</div>'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        f'style="width:100%;background:{_BACKGROUND};"><tr><td align="center" style="padding:32px 14px;">'
        '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" '
        f'style="width:100%;max-width:600px;border:1px solid {_BORDER};border-radius:16px;'
        f'background:{_SURFACE};">'
        f'<tr><td height="5" bgcolor="{_PRIMARY}" style="height:5px;background:{_PRIMARY};'
        'font-size:0;line-height:0;border-radius:16px 16px 0 0;">&nbsp;</td></tr>'
        '<tr><td style="padding:24px 28px 18px;border-bottom:1px solid ' + _BORDER + ';">'
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
        '<td valign="middle" style="padding-right:11px;">'
        f'<img src="{_LOGO_URL}" alt="Símbolo da Nexo" width="42" height="42" '
        'style="display:block;width:42px;height:42px;border:0;outline:none;text-decoration:none;">'
        '</td><td valign="middle">'
        f'<div style="color:{_PRIMARY};font:bold 16px/1.3 Arial,Helvetica,sans-serif;letter-spacing:2px;">NEXO</div>'
        f'<div style="padding-top:5px;color:{_MUTED};font:12px/1.5 Arial,Helvetica,sans-serif;">'
        'Automação inteligente para sua equipe</div></td>'
        '</tr></table>'
        '</td></tr><tr><td style="padding:30px 28px 24px;">'
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
        f'<td bgcolor="{_PRIMARY_SOFT}" style="padding:5px 9px;border:1px solid {_BORDER};'
        f'border-radius:999px;background:{_PRIMARY_SOFT};color:{_PRIMARY};'
        f'font:bold 10px/1.3 Arial,Helvetica,sans-serif;letter-spacing:1px;">{safe_eyebrow}</td>'
        '</tr></table>'
        f'<h1 style="margin:16px 0 20px;color:{_FOREGROUND};font:bold 25px/1.3 Arial,Helvetica,sans-serif;">'
        f'{safe_heading}</h1>'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
        f'{body}{code_block}{action}</table>'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        f'style="border-top:1px solid {_BORDER};"><tr><td style="padding:18px 0 0;color:{_MUTED};'
        'font:12px/1.6 Arial,Helvetica,sans-serif;">Esta é uma mensagem automática da Nexo. '
        'Acesse o painel pelo endereço oficial: '
        '<a href="https://www.nexoaicompany.com" style="color:' + _PRIMARY +
        ';text-decoration:underline;">nexoaicompany.com</a></td></tr></table>'
        '</td></tr></table></td></tr></table></body></html>'
    )


class AccountMessages:
    def __init__(self, sender):
        self.sender = sender
        settings = getattr(sender, "settings", None)
        frontend_url = getattr(settings, "frontend_url", None)
        self.frontend_url = (frontend_url if isinstance(frontend_url, str)
                             else "https://www.nexoaicompany.com")

    def _send(self, recipient, subject, preheader, heading, paragraphs, *, code=None,
              expires_in=None, action_label=None, action_url=None, eyebrow="PAINEL NEXO"):
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
                               action_label=action_label, action_url=action_url, eyebrow=eyebrow),
        )

    def registration_code(self, recipient, code, expires_in):
        return self._send(
            recipient, "Código para confirmar seu cadastro na Nexo",
            "Confirme seu endereço de e-mail para concluir o cadastro.",
            "Confirme seu cadastro",
            ["Use o código abaixo para confirmar seu endereço de e-mail e continuar o cadastro da sua conta Nexo."],
            code=code, expires_in=expires_in, eyebrow="SEGURANÇA DA CONTA",
        )

    def recovery_code(self, recipient, code, expires_in):
        return self._send(
            recipient, "Código para atualizar sua senha Nexo",
            "Use seu código para criar uma nova senha.",
            "Redefina sua senha",
            ["Use o código abaixo para confirmar a solicitação de troca de senha."],
            code=code, expires_in=expires_in, eyebrow="SEGURANÇA DA CONTA",
        )

    def deletion_code(self, recipient, code, expires_in):
        return self._send(
            recipient, "Confirme a exclusão da sua conta Nexo",
            "Confirme a solicitação de exclusão da sua conta.",
            "Confirme a exclusão da conta",
            ["Use o código abaixo para confirmar a exclusão da sua conta Nexo."],
            code=code, expires_in=expires_in, eyebrow="SEGURANÇA DA CONTA",
        )

    def welcome(self, user):
        if not self.sender.configured:
            return
        try:
            self._send(
                user.email, "Cadastro Nexo recebido",
                "Recebemos seu cadastro e ele aguarda aprovação.",
                "Seu cadastro foi recebido",
                ["Olá, " + (getattr(user, "name", None) or "pessoa") + ". Seu cadastro foi recebido e aguarda aprovação do administrador.",
                 "Você receberá outro e-mail assim que a decisão sobre seu acesso for registrada."],
                eyebrow="CADASTRO RECEBIDO",
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
                       action_url=self.frontend_url.rstrip("/") + "/admin" if action_label else None,
                       eyebrow="STATUS DA CONTA")
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
            title, [body], eyebrow="AVISO DA EQUIPE",
        )
        return True

    def maps_results(self, user, job_id: str, name: str, found: int, in_funnel: int, leads: list[dict],
                     contact_label: str | None = None, without_contact: int = 0):
        if not self.sender.configured:
            return False
        paragraphs = ["Olá, " + (getattr(user, "name", None) or "pessoa") + ". A busca \"" + name + "\" terminou."]
        paragraphs.append(
            f"Foram encontradas {found} empresa(s) nova(s)" + (f" com {contact_label}" if contact_label else "")
            + (f"; {without_contact} sem esse contato ficaram de fora" if without_contact else "")
            + (f"; {in_funnel} já estavam no funil e foram ocultadas." if in_funnel else "."))
        if leads:
            lines = []
            for lead in leads:
                details = [lead.get("phone"), lead.get("address")]
                lines.append("• " + lead["title"] + "".join(" · " + detail for detail in details if detail))
            if found > len(leads):
                lines.append(f"… e mais {found - len(leads)} no painel.")
            paragraphs.append("\n".join(lines))
        paragraphs.append("Abra o painel para ver o resultado completo, abrir cada empresa no mapa e adicionar os leads ao funil.")
        self._send(
            user.email, "Sua busca no Maps terminou: " + name,
            f"{found} empresa(s) nova(s) encontradas" + (f" com {contact_label}." if contact_label else "."),
            "Busca do Maps concluída", paragraphs,
            action_label="Ver resultados", action_url=self.maps_url(job_id), eyebrow="MAPS",
        )
        return True

    def maps_failed(self, user, job_id: str, name: str):
        if not self.sender.configured:
            return False
        self._send(
            user.email, "Sua busca no Maps não terminou: " + name,
            "A busca não foi concluída.",
            "A busca do Maps falhou",
            ["Olá, " + (getattr(user, "name", None) or "pessoa") + ". A busca \"" + name + "\" não terminou com sucesso.",
             "Tente novamente com outra região ou com menos profundidade."],
            action_label="Abrir o Maps", action_url=self.maps_url(job_id), eyebrow="MAPS",
        )
        return True

    def maps_url(self, job_id: str) -> str:
        return self.frontend_url.rstrip("/") + "/admin?" + urlencode({"maps": job_id})

    def automation_invitation(self, user, invite_url: str, message: str):
        if not self.sender.configured:
            return False
        paragraphs = [
            "Olá, " + (getattr(user, "name", None) or "pessoa") + ". Sua solicitação de acesso ao n8n da Nexo foi aprovada.",
        ]
        if message:
            paragraphs.append(message)
        self._send(
            user.email, "Seu convite para o n8n da Nexo",
            "Seu acesso ao n8n está pronto. Use o link seguro para criar sua conta.",
            "Seu convite para o n8n chegou", paragraphs,
            action_label="Criar minha conta no n8n", action_url=invite_url,
            eyebrow="AUTOMAÇÕES",
        )
        return True
