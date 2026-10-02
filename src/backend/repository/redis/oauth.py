import hashlib
import hmac
import json
import re
import secrets


class OAuthStateError(ValueError):
    pass


class OAuthRepository:
    def __init__(self, redis, namespace: str):
        self.redis, self.namespace = redis, namespace

    def _key(self, kind, token):
        if not isinstance(token, str) or not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
            raise OAuthStateError("Invalid or expired Google flow")
        return self.namespace + ":" + kind + ":" + hashlib.sha256(token.encode()).hexdigest()

    def save(self, kind, value, ttl):
        token = secrets.token_urlsafe(32)
        self.redis.set(self._key(kind, token), json.dumps(value), ex=ttl)
        return token

    def read(self, kind, token):
        raw = self.redis.get(self._key(kind, token))
        if raw is None:
            raise OAuthStateError("Invalid or expired Google flow")
        return json.loads(raw)

    def consume(self, kind, token):
        raw = self.redis.getdel(self._key(kind, token))
        if raw is None:
            raise OAuthStateError("Invalid or expired Google flow")
        return json.loads(raw)

    def consume_state(self, state, browser):
        record = self.read("state", state)
        expected = hashlib.sha256(browser.encode()).hexdigest()
        if not hmac.compare_digest(record["browser"], expected):
            raise OAuthStateError("Invalid or expired Google flow")
        consumed = self.consume("state", state)
        if consumed != record:
            raise OAuthStateError("Invalid or expired Google flow")
        return consumed
