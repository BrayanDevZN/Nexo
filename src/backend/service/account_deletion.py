from concurrent.futures import CancelledError, TimeoutError

from backend.infra.connections.email import EmailQueueFullError, EmailUnavailableError
from backend.service.access import ResourceConflict, authorize
from backend.service.email_messages import AccountMessages


class DeletionCodeError(ValueError):
    pass


class DeletionCooldownError(ValueError):
    pass


class AccountDeletionService:
    def __init__(self, repositories, members, codes, code_repository, sender, *, delivery_timeout=12, messages=None):
        self.repositories, self.members = repositories, members
        self.codes, self.code_repository, self.sender = codes, code_repository, sender
        self.delivery_timeout, self.messages = delivery_timeout, messages

    def _user(self, actor):
        with self.repositories.read_transaction() as repos:
            user = authorize(repos, actor)
            principal = repos.users.principal_admin()
            if principal and principal.id == user.id:
                raise ResourceConflict("Principal administrator cannot be deleted")
            return user

    def request(self, actor):
        user = self._user(actor)
        if not self.sender.configured:
            raise EmailUnavailableError("Account deletion email unavailable")
        code = self.codes.create()
        digest = self.codes.digest(user.email, code)
        record = {"user_id": user.id, "version": user.session_version}
        if not self.code_repository.issue(user.email, digest, record):
            raise DeletionCooldownError("Wait before requesting another code")
        try:
            future = (self.messages.deletion_code(user.email, code, self.code_repository.ttl)
                      if self.messages else self.sender.send(
                          user.email, "Confirme a exclusão da sua conta Nexo",
                          "Seu código para excluir sua conta é: " + code +
                          "\nEle expira em " + str(self.code_repository.ttl) +
                          " segundos. Se você não solicitou a exclusão, ignore este email."))
            future.result(timeout=self.delivery_timeout)
        except (EmailQueueFullError, EmailUnavailableError, TimeoutError, CancelledError):
            self.code_repository.remove(user.email, digest)
            raise EmailUnavailableError("Account deletion email unavailable") from None

    def confirm(self, actor, code):
        user = self._user(actor)
        record = self.code_repository.consume(user.email, self.codes.digest(user.email, code))
        if record != {"user_id": user.id, "version": user.session_version}:
            raise DeletionCodeError("Invalid or expired deletion code")
        # Recheck the SQL session version inside the deletion transaction.
        self.members.remove_self(user)
