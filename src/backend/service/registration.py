import logging

from backend.infra.connections.email import EmailQueueFullError, EmailUnavailableError
from backend.service.auth import RegistrationConflict

logger = logging.getLogger(__name__)


class RegistrationCodeError(ValueError):
    pass


class RegistrationService:
    def __init__(self, auth, codes, repository, sender):
        self.auth, self.codes, self.repository, self.sender = auth, codes, repository, sender

    def request(self, *, name, email, phone, password):
        email = email.strip().lower()
        with self.auth.repositories.transaction() as repos:
            if repos.users.by_email(email):
                raise RegistrationConflict("Email already registered")
        if not self.sender.configured:
            raise EmailUnavailableError("Registration email unavailable")
        code = self.codes.create()
        digest = self.codes.digest(email, code)
        record = {"name": name, "email": email, "phone": phone,
                  "password_hash": self.auth.passwords.hash(password)}
        if not self.repository.issue(email, digest, record):
            return
        try:
            future = self.sender.send(email, "Código para confirmar seu cadastro Nexo",
                                      "Seu código de confirmação é: " + code +
                                      "\nEle expira em " + str(self.repository.ttl) + " segundos.")
        except (EmailQueueFullError, EmailUnavailableError):
            self.repository.remove(email, digest)
            raise EmailUnavailableError("Registration email unavailable") from None

        def finished(result):
            if result.cancelled() or result.exception() is not None:
                try:
                    self.repository.remove(email, digest)
                except Exception:
                    logger.warning("Registration code cleanup failed")
        future.add_done_callback(finished)

    def confirm(self, email, code):
        email = email.strip().lower()
        record = self.repository.consume(email, self.codes.digest(email, code))
        if record is None:
            raise RegistrationCodeError("Invalid or expired registration code")
        return self.auth.register(**record)
