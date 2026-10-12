import logging
from urllib.parse import urlsplit

from sqlalchemy.exc import IntegrityError

from backend.infra.connections.email import EmailQueueFullError, EmailUnavailableError
from backend.repository.db.models.base import utc_now
from backend.service.access import authorize, authorize_read

logger = logging.getLogger(__name__)


class AutomationRequestPermissionError(ValueError):
    pass


class AutomationRequestNotFound(ValueError):
    pass


class AutomationRequestConflict(ValueError):
    pass


class AutomationRequestValidationError(ValueError):
    pass


class AutomationEmailUnavailable(ValueError):
    pass


class AutomationRequestService:
    invite_host = "n8n.nexoaicompany.com"

    def __init__(self, repositories, cached_repositories, messages, push=None):
        self.repositories = repositories
        self.cached_repositories = cached_repositories
        self.messages = messages
        self.push = push

    @staticmethod
    def _admin(user):
        if user.role != "owner":
            raise AutomationRequestPermissionError("Owner access required")

    def list(self, actor, *, limit=50, offset=0):
        with self.cached_repositories.read_transaction() as repos:
            current = authorize_read(repos.db, actor, approved=True)
            return repos.db.automation_requests.list(
                requester_id=None if current.role == "owner" else current.id,
                limit=limit, offset=offset,
            )

    def create(self, actor, *, details=None):
        recipients = []
        try:
            with self.repositories.transaction() as repos:
                current = authorize(repos, actor, approved=True)
                if repos.automation_requests.pending_for_user(current.id):
                    raise AutomationRequestConflict("A pending n8n account request already exists")
                row = repos.automation_requests.create(user=current, details=details)
                recipients = repos.users.approved_admins()
                body = f"{current.name} solicitou acesso a uma conta n8n."
                if details:
                    body += " Motivo: " + details
                for admin in recipients:
                    repos.notifications.create_automation_notice(
                        recipient_id=admin.id, user_id=current.id,
                        kind="automation_request", title="Nova solicitação de conta n8n",
                        body=body,
                    )
        except Exception as error:
            # Concurrent requests can both pass the initial lookup; the unique
            # active_requester_id constraint makes the second insert harmless.
            if isinstance(error, IntegrityError):
                raise AutomationRequestConflict("A pending n8n account request already exists") from None
            raise
        self._push(recipients, "Nova solicitação de conta n8n", body)
        return {"id": row.id, "status": row.status, "details": row.details,
                "created_at": row.created_at, "updated_at": row.updated_at}

    @classmethod
    def validate_invite_url(cls, value):
        try:
            parsed = urlsplit(str(value))
            valid = (parsed.scheme == "https" and parsed.hostname == cls.invite_host
                     and parsed.username is None and parsed.password is None
                     and parsed.port in (None, 443))
        except ValueError:
            valid = False
        if not valid:
            raise AutomationRequestValidationError(
                "Use um link HTTPS de convite do domínio n8n.nexoaicompany.com"
            )
        return str(value)

    def invite(self, actor, identifier, *, invite_url, message=""):
        invite_url = self.validate_invite_url(invite_url)
        message = message.strip()
        requester = None
        try:
            with self.repositories.transaction() as repos:
                current = authorize(repos, actor, approved=True)
                self._admin(current)
                row = repos.automation_requests.get(identifier)
                if row is None:
                    raise AutomationRequestNotFound("Automation request not found")
                if row.status != "pending":
                    raise AutomationRequestConflict("This request has already been resolved")
                requester = repos.users.get(row.requested_by_id)
                if requester is None or requester.status != "approved":
                    raise AutomationRequestConflict("The requesting Nexo account is no longer active")
                if not self.messages or not self.messages.automation_invitation(requester, invite_url, message):
                    raise AutomationEmailUnavailable("Email delivery is not configured")
                row.status = "invited"
                row.active_requester_id = None
                row.invite_url = invite_url
                row.admin_message = message or None
                row.reviewed_by_id = current.id
                row.resolved_at = utc_now()
                notice_body = "Seu convite para criar uma conta no n8n está pronto. Acesse a aba Automações para abrir o link enviado por e-mail."
                if message:
                    notice_body += "\n\n" + message
                notice_body += "\n\n" + invite_url
                repos.notifications.create_automation_notice(
                    recipient_id=requester.id, user_id=current.id,
                    kind="automation_invitation", title="Convite para o n8n da Nexo",
                    body=notice_body,
                )
        except (EmailUnavailableError, EmailQueueFullError) as error:
            logger.warning("n8n invitation email could not be queued: %s", type(error).__name__)
            raise AutomationEmailUnavailable("Não foi possível colocar o e-mail na fila") from None
        self._push([requester], "Seu convite para o n8n está pronto", notice_body)
        return {"id": row.id, "status": row.status, "invite_url": row.invite_url,
                "resolved_at": row.resolved_at, "updated_at": row.updated_at}

    def reject(self, actor, identifier, *, message=""):
        message = message.strip()
        requester = None
        with self.repositories.transaction() as repos:
            current = authorize(repos, actor, approved=True)
            self._admin(current)
            row = repos.automation_requests.get(identifier)
            if row is None:
                raise AutomationRequestNotFound("Automation request not found")
            if row.status != "pending":
                raise AutomationRequestConflict("This request has already been resolved")
            requester = repos.users.get(row.requested_by_id)
            if requester is None:
                raise AutomationRequestNotFound("Requesting user not found")
            row.status = "rejected"
            row.active_requester_id = None
            row.admin_message = message or None
            row.reviewed_by_id = current.id
            row.resolved_at = utc_now()
            notice_body = "Sua solicitação de conta n8n foi recusada."
            if message:
                notice_body += "\n\n" + message
            repos.notifications.create_automation_notice(
                recipient_id=requester.id, user_id=current.id,
                kind="automation_rejected", title="Solicitação de conta n8n recusada",
                body=notice_body,
            )
        self._push([requester], "Solicitação de conta n8n recusada", notice_body)
        return {"id": row.id, "status": row.status, "resolved_at": row.resolved_at,
                "updated_at": row.updated_at}

    def _push(self, users, title, body):
        if self.push:
            try:
                self.push.notify_users([user.id for user in users], title, body, "/admin")
            except Exception:
                logger.warning("n8n request push notification could not be delivered", exc_info=True)
