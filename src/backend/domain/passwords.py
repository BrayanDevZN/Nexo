import bcrypt


class PasswordPolicyError(ValueError):
    pass


class PasswordHasher:
    def __init__(self, rounds: int = 12):
        if not 4 <= rounds <= 16:
            raise ValueError("bcrypt rounds must be between 4 and 16")
        self.rounds = rounds

    @staticmethod
    def _encode(password: str, *, new_password: bool = False) -> bytes:
        if not isinstance(password, str):
            raise PasswordPolicyError("Password must be text")
        try:
            encoded = password.encode("utf-8")
        except UnicodeError:
            raise PasswordPolicyError("Password must be valid UTF-8") from None
        if not encoded or len(encoded) > 72:
            raise PasswordPolicyError("Password must contain 1 to 72 UTF-8 bytes")
        if new_password and len(password) < 12:
            raise PasswordPolicyError("New passwords must contain at least 12 characters")
        return encoded

    def hash(self, password: str) -> str:
        encoded = self._encode(password, new_password=True)
        return bcrypt.hashpw(encoded, bcrypt.gensalt(rounds=self.rounds)).decode("ascii")

    def verify(self, password: str, password_hash: str | None) -> bool:
        if not password_hash:
            return False
        try:
            return bcrypt.checkpw(self._encode(password), password_hash.encode("ascii"))
        except (ValueError, TypeError, AttributeError, UnicodeError):
            return False
