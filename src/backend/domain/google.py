import hmac
from dataclasses import dataclass

import jwt
from email_validator import EmailNotValidError, validate_email


class GoogleIdentityError(ValueError):
    pass


@dataclass(frozen=True)
class GoogleIdentity:
    subject: str
    email: str
    name: str


class GoogleTokenVerifier:
    def __init__(self, client_id: str):
        self.client_id = client_id

    def verify(self, token: str, keys: dict, nonce: str) -> GoogleIdentity:
        try:
            header = jwt.get_unverified_header(token)
            if header.get("alg") != "RS256" or not header.get("kid"):
                raise GoogleIdentityError()
            matches = [key for key in keys["keys"] if key.get("kid") == header["kid"]]
            if len(matches) != 1:
                raise GoogleIdentityError()
            key = jwt.algorithms.RSAAlgorithm.from_jwk(matches[0])
            claims = jwt.decode(token, key, algorithms=["RS256"], audience=self.client_id,
                                issuer=["https://accounts.google.com", "accounts.google.com"],
                                options={"require": ["sub", "email", "email_verified", "nonce",
                                                     "iss", "aud", "iat", "exp"]})
            if (claims["email_verified"] is not True
                    or not isinstance(claims["nonce"], str)
                    or not hmac.compare_digest(claims["nonce"].encode(), nonce.encode())
                    or not isinstance(claims["sub"], str) or not claims["sub"]
                    or len(claims["sub"]) > 255
                    or ("azp" in claims and claims["azp"] != self.client_id)
                    or (isinstance(claims["aud"], list) and len(claims["aud"]) > 1
                        and claims.get("azp") != self.client_id)):
                raise GoogleIdentityError()
            email = validate_email(claims["email"], check_deliverability=False).normalized.lower()
            name = claims.get("name")
            name = name.strip()[:120] if isinstance(name, str) and name.strip() else email.split("@")[0]
            return GoogleIdentity(claims["sub"], email, name)
        except (jwt.PyJWTError, ValueError, TypeError, KeyError, EmailNotValidError):
            raise GoogleIdentityError("Invalid Google identity") from None
