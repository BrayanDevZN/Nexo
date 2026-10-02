import hashlib
import hmac
import secrets


class EmailCodeService:
    def __init__(self, secret: str):
        self.secret = secret.encode()

    @staticmethod
    def create() -> str:
        return f"{secrets.randbelow(100_000_000):08d}"

    def digest(self, email: str, code: str) -> str:
        payload = "nexo:password-recovery:" + email.strip().lower() + ":" + code
        return hmac.new(self.secret, payload.encode(), hashlib.sha256).hexdigest()
