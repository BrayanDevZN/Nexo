import base64
import hashlib
import logging
from urllib.parse import urlencode

from httpx import AsyncClient

logger = logging.getLogger(__name__)


class GoogleProviderError(ValueError):
    pass


class GoogleConnection:
    authorization_endpoint = "https://accounts.google.com/o/oauth2/v2/auth"
    token_endpoint = "https://oauth2.googleapis.com/token"
    jwks_endpoint = "https://www.googleapis.com/oauth2/v3/certs"

    def __init__(self, settings):
        self.client_id = settings.google_client_id
        self.secret = settings.google_client_secret
        self.redirect_uri = settings.google_redirect_uri

    def authorization_url(self, state, nonce, verifier):
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
        return self.authorization_endpoint + "?" + urlencode({
            "client_id": self.client_id, "redirect_uri": self.redirect_uri,
            "response_type": "code", "scope": "openid email profile", "state": state,
            "nonce": nonce, "code_challenge": challenge, "code_challenge_method": "S256",
        })

    async def exchange(self, code, verifier, nonce):
        stage = "token_exchange"
        try:
            async with AsyncClient(timeout=10, trust_env=False) as client:
                response = await client.post(self.token_endpoint, data={
                    "client_id": self.client_id,
                    "client_secret": self.secret.get_secret_value(),
                    "code": code,
                    "code_verifier": verifier,
                    "grant_type": "authorization_code",
                    "redirect_uri": self.redirect_uri,
                })
                response.raise_for_status()
                token = response.json()
                if not token.get("id_token"):
                    raise GoogleProviderError("Google did not return an identity token")
            stage = "signing_keys"
            async with AsyncClient(timeout=10, trust_env=False) as client:
                response = await client.get(self.jwks_endpoint)
                response.raise_for_status()
                keys = response.json()
            return {"id_token": token["id_token"], "keys": keys}
        except Exception as exc:
            # Provider errors can contain codes, tokens or credentials.
            logger.warning("Google provider failed: stage=%s category=%s", stage, type(exc).__name__)
            raise GoogleProviderError("Google authentication failed") from None
