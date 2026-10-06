import logging
from concurrent.futures import CancelledError, TimeoutError

from backend.infra.connections.email import EmailQueueFullError, EmailUnavailableError
from backend.service.auth import RegistrationConflict

logger = logging.getLogger(__name__)


class RegistrationCodeError(ValueError):
    pass


class RegistrationCooldownError(ValueError):
    pass


class RegistrationService:
    def __init__(self, auth, codes, repository, sender, *, delivery_timeout=12):
        self.auth, self.codes, self.repository, self.sender = auth, codes, repository, sender
        self.delivery_timeout = delivery_timeout

    def request(self, *, name, email, phone, password):
        email = email.strip().lower()
        with self.auth.repositories.read_transaction() as repos:
            if repos.users.by_email(email):
                raise RegistrationConflict("Email already registered")
        if not self.sender.configured:
            raise EmailUnavailableError("Registration email unavailable")
        code = self.codes.create()
        digest = self.codes.digest(email, code)
        record = {"name": name, "email": email, "phone": phone,
                  "password_hash": self.auth.passwords.hash(password)}
        if not self.repository.issue(email, digest, record):
            raise RegistrationCooldownError("Wait before requesting another code")
        try:
            future = self.sender.send(email, "Código para confirmar seu cadastro Nexo",
                                      "Seu código de confirmação é: " + code +
                                      "\nEle expira em " + str(self.repository.ttl) + " segundos.")
            # Resend must accept the message before the browser advances to confirmation.
            future.result(timeout=self.delivery_timeout)
        except (EmailQueueFullError, EmailUnavailableError, TimeoutError, CancelledError):
            self.repository.remove(email, digest)
            logger.warning("Registration email was not accepted by Resend")
            raise EmailUnavailableError("Registration email unavailable") from None

    def confirm(self, email, code):
        email = email.strip().lower()
        record = self.repository.consume(email, self.codes.digest(email, code))
        if record is None:
            raise RegistrationCodeError("Invalid or expired registration code")
        return self.auth.register(**record)
