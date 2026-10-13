import hashlib
import json
import re
import secrets


class InvitationError(ValueError):
    pass


class InvitationRepository:
    def __init__(self, redis, namespace: str):
        self.redis, self.namespace = redis, namespace

    def _key(self, token: str) -> str:
        if not isinstance(token, str) or not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
            raise InvitationError("Invalid or expired invitation")
        digest = hashlib.sha256(token.encode()).hexdigest()
        return f"{self.namespace}:invite:{digest}"

    def create(self, role: str, created_by: str, ttl: int = 604800) -> str:
        token = secrets.token_urlsafe(32)
        self.redis.set(self._key(token), json.dumps({"role": role, "created_by": created_by}), ex=ttl)
        return token

    def read(self, token: str) -> dict:
        value = self.redis.get(self._key(token))
        if value is None:
            raise InvitationError("Invalid or expired invitation")
        return json.loads(value)

    def consume(self, token: str) -> dict:
        value = self.redis.getdel(self._key(token))
        if value is None:
            raise InvitationError("Invalid or expired invitation")
        return json.loads(value)
