from sqlalchemy.exc import IntegrityError

from backend.service.approvals import ApprovalService
from backend.service.security import AuthenticationError


class RegistrationConflict(ValueError):
    pass


class AuthService:
    def __init__(self, repositories, passwords, sessions, messages=None):
        self.repositories, self.passwords, self.sessions = repositories, passwords, sessions
        self.messages = messages
        # Verify an equivalent hash even when the email does not exist.
        self._dummy_hash = passwords.hash("unused-login-placeholder-password")

    def register(self, *, name, email, phone, password):
        hashed = self.passwords.hash(password)
        try:
            with self.repositories.transaction() as repos:
                if repos.users.by_email(email):
                    raise RegistrationConflict("Email already registered")
                user = repos.users.create(name=name, email=email, phone=phone,
                                          password_hash=hashed)
                ApprovalService.notify_registration(repos, user)
            if self.messages:
                self.messages.welcome(user)
            return user
        except IntegrityError:
            raise RegistrationConflict("Email already registered") from None

    def login(self, email, password):
        with self.repositories.transaction() as repos:
            user = repos.users.by_email(email)
        hashed = user.password_hash if user and user.password_hash else self._dummy_hash
        valid = self.passwords.verify(password, hashed)
        if not valid or user is None or not user.password_hash or user.status == "rejected":
            raise AuthenticationError("Invalid email or password")
        return user, self.sessions.issue(user)

    def bootstrap_admin(self, settings):
        if settings.admin_email is None:
            return
        email = str(settings.admin_email).lower()
        with self.repositories.transaction() as repos:
            existing = repos.users.by_email(email)
            if existing:
                self._validate_admin(existing)
                return
            if repos.users.principal_admin():
                raise RuntimeError("Configured administrator differs from existing administrator")
        hashed = self.passwords.hash(settings.admin_password.get_secret_value())
        try:
            with self.repositories.transaction() as repos:
                repos.users.create(name=settings.admin_name, email=email, password_hash=hashed,
                                   role="admin", status="approved")
        except IntegrityError:
            with self.repositories.transaction() as repos:
                self._validate_admin(repos.users.by_email(email))

    @staticmethod
    def _validate_admin(user):
        if user is None or user.role != "admin" or user.status != "approved":
            raise RuntimeError("Configured email is not an approved administrator")
