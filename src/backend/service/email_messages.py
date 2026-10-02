import logging

from backend.infra.connections.email import EmailQueueFullError, EmailUnavailableError

logger = logging.getLogger(__name__)


class AccountMessages:
    def __init__(self, sender):
        self.sender = sender

    def welcome(self, user):
        if not self.sender.configured:
            return
        try:
            self.sender.send(user.email, "Cadastro Nexo recebido",
                             "Seu cadastro foi recebido e aguarda aprovação do administrador.")
        except (EmailUnavailableError, EmailQueueFullError):
            # The committed account survives failures in best-effort welcome delivery.
            logger.warning("Welcome email could not be queued")
