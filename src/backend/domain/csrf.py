import hashlib
import hmac


class CSRFService:
    def __init__(self, secret: str):
        self._secret = secret.encode()

    def create(self, session_id: str) -> str:
        return hmac.new(self._secret, ("nexo:csrf:" + session_id).encode(),
                        hashlib.sha256).hexdigest()

    def verify(self, session_id: str, token: str) -> bool:
        return isinstance(token, str) and hmac.compare_digest(self.create(session_id).encode(), token.encode())
