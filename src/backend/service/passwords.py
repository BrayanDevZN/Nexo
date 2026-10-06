import logging

from backend.infra.connections.email import EmailQueueFullError, EmailUnavailableError
from backend.service.security import AuthenticationError

logger = logging.getLogger(__name__)


class PasswordRecoveryError(ValueError):
    pass


class PasswordService:
    def __init__(self, repositories, passwords, codes, code_repository, sender, messages=None):
        self.repositories, self.passwords = repositories, passwords
        self.codes, self.code_repository, self.sender = codes, code_repository, sender
        self.messages = messages

    def change(self, actor, current_password, new_password):
        with self.repositories.read_transaction() as repos:
            user = repos.users.get(actor.id)
            if (user is None or user.session_version != actor.session_version
                    or user.status == "rejected"):
                raise AuthenticationError("Invalid or expired session")
        if not self.passwords.verify(current_password, user.password_hash):
            raise PasswordRecoveryError("Current password is incorrect")
        hashed = self.passwords.hash(new_password)
        with self.repositories.transaction() as repos:
            if not repos.users.replace_password_if_current(user.id, user.session_version, hashed):
                raise AuthenticationError("Invalid or expired session")

    def request_code(self, email):
        if not self.sender.configured:
            raise EmailUnavailableError("Email recovery is unavailable")
        email = email.strip().lower()
        with self.repositories.read_transaction() as repos:
            user = repos.users.by_email(email)
        eligible = user is not None and user.password_hash is not None and user.status != "rejected"
        code = self.codes.create()
        digest = self.codes.digest(email, code)
        record = {"user_id": user.id if eligible else None,
                  "version": user.session_version if eligible else None}
        # Same Redis operations and cooldown for known and unknown addresses.
        if not self.code_repository.issue(email, digest, record) or not eligible:
            return
        try:
            future = (self.messages.recovery_code(email, code, self.code_repository.ttl)
                      if self.messages else self.sender.send(
                          email, "Código para atualizar sua senha Nexo",
                          "Seu código de recuperação é: " + code +
                          "\nEle expira em " + str(self.code_repository.ttl) +
                          " segundos. Se você não pediu, ignore este e-mail."))
        except (EmailUnavailableError, EmailQueueFullError):
            self._remove_failed_delivery(email, digest)
            logger.warning("Recovery email could not be queued")
            return

        def finished(result):
            if result.cancelled() or result.exception() is not None:
                self._remove_failed_delivery(email, digest)
        future.add_done_callback(finished)

    def _remove_failed_delivery(self, email, digest):
        try:
            self.code_repository.remove(email, digest)
        except Exception:
            logger.warning("Recovery code cleanup failed")

    def confirm(self, email, code, new_password):
        email = email.strip().lower()
        record = self.code_repository.consume(email, self.codes.digest(email, code))
        if record is None or record["user_id"] is None:
            raise PasswordRecoveryError("Invalid or expired recovery code")
        hashed = self.passwords.hash(new_password)
        with self.repositories.transaction() as repos:
            user = repos.users.get(record["user_id"])
            if (user is None or user.email != email or not user.password_hash
                    or user.status == "rejected"
                    or not repos.users.replace_password_if_current(user.id, record["version"], hashed)):
                raise PasswordRecoveryError("Invalid or expired recovery code")
