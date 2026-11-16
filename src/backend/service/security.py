from backend.domain.tokens import InvalidTokenError, JWTService
from backend.repository.db.control.manager import RepositoryManager


class AuthenticationError(ValueError):
    pass


class SessionSecurity:
    """Sessions of one account table: the panel's ``users`` or the scheduling product's ``booking_users``."""

    def __init__(self, tokens: JWTService, repositories: RepositoryManager, repository_name: str = "users"):
        self.tokens, self.repositories = tokens, repositories
        self.repository_name = repository_name

    def issue(self, user) -> str:
        if getattr(user, "status", "approved") == "rejected":
            raise AuthenticationError("Session is not authorized")
        return self.tokens.create(user.id, user.session_version)

    def authenticate(self, token: str):
        try:
            claims = self.tokens.read(token)
        except InvalidTokenError:
            raise AuthenticationError("Invalid or expired session") from None
        # Authoritative SQL read: cached snapshots cannot authorize a session.
        with self.repositories.read_transaction() as repos:
            user = getattr(repos, self.repository_name).get(claims.user_id)
            if (user is None or user.session_version != claims.session_version
                    or getattr(user, "status", "approved") not in {"pending", "approved"}):
                raise AuthenticationError("Invalid or expired session")
            return user

    def revoke_all(self, user_id: str) -> bool:
        with self.repositories.transaction() as repos:
            repository = getattr(repos, self.repository_name)
            user = repository.get(user_id)
            if user is None:
                return False
            repository.revoke_sessions(user)
            return True
