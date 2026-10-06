from backend.domain.tokens import InvalidTokenError, JWTService
from backend.repository.db.control.manager import RepositoryManager


class AuthenticationError(ValueError):
    pass


class SessionSecurity:
    def __init__(self, tokens: JWTService, repositories: RepositoryManager):
        self.tokens, self.repositories = tokens, repositories

    def issue(self, user) -> str:
        if user.status == "rejected":
            raise AuthenticationError("Session is not authorized")
        return self.tokens.create(user.id, user.session_version)

    def authenticate(self, token: str):
        try:
            claims = self.tokens.read(token)
        except InvalidTokenError:
            raise AuthenticationError("Invalid or expired session") from None
        # Authoritative SQL read: cached snapshots cannot authorize a session.
        with self.repositories.read_transaction() as repos:
            user = repos.users.get(claims.user_id)
            if (user is None or user.session_version != claims.session_version
                    or user.status not in {"pending", "approved"}):
                raise AuthenticationError("Invalid or expired session")
            return user

    def revoke_all(self, user_id: str) -> bool:
        with self.repositories.transaction() as repos:
            user = repos.users.get(user_id)
            if user is None:
                return False
            repos.users.revoke_sessions(user)
            return True
