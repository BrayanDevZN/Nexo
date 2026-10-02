from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import uuid4

import jwt


class InvalidTokenError(ValueError):
    pass


@dataclass(frozen=True)
class SessionClaims:
    user_id: str
    session_version: int
    token_id: str
    expires_at: int


class JWTService:
    issuer = "nexo-backend"
    audience = "nexo-admin"

    def __init__(self, secret: str, *, expire_minutes: int = 30, clock=None):
        if len(secret) < 32 or expire_minutes < 1:
            raise ValueError("Strong JWT secret and positive expiration are required")
        self._secret, self._ttl = secret, expire_minutes * 60
        self._clock = clock or (lambda: datetime.now(UTC))

    def create(self, user_id: str, session_version: int) -> str:
        if not isinstance(user_id, str) or not user_id:
            raise ValueError("User ID is required")
        if type(session_version) is not int or session_version < 0:
            raise ValueError("Invalid session version")
        now = int(self._clock().timestamp())
        return jwt.encode({
            "sub": user_id, "ver": session_version, "jti": str(uuid4()),
            "iat": now, "nbf": now, "exp": now + self._ttl,
            "iss": self.issuer, "aud": self.audience, "kind": "access",
        }, self._secret, algorithm="HS256")

    def read(self, token: str) -> SessionClaims:
        if not isinstance(token, str) or not token or len(token) > 4096:
            raise InvalidTokenError("Invalid or expired session token")
        try:
            claims = jwt.decode(
                token, self._secret, algorithms=["HS256"],
                issuer=self.issuer, audience=self.audience,
                options={"require": ["sub", "ver", "jti", "iat", "nbf", "exp", "iss", "aud", "kind"],
                         "strict_aud": True},
            )
            if (not claims["sub"] or not claims["jti"] or claims["kind"] != "access"
                    or type(claims["ver"]) is not int or claims["ver"] < 0
                    or any(type(claims[key]) is not int for key in ["iat", "nbf", "exp"])
                    or not claims["iat"] <= claims["nbf"] < claims["exp"]
                    or claims["exp"] - claims["iat"] > self._ttl):
                raise InvalidTokenError("Invalid or expired session token")
            return SessionClaims(claims["sub"], claims["ver"], claims["jti"], claims["exp"])
        except (jwt.InvalidTokenError, TypeError, ValueError, KeyError):
            raise InvalidTokenError("Invalid or expired session token") from None
