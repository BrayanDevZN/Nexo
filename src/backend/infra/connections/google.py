import base64
import hashlib
from urllib.parse import urlencode

import httpx
from authlib.integrations.httpx_client import AsyncOAuth2Client


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
        try:
            async with AsyncOAuth2Client(
                self.client_id, self.secret.get_secret_value(), redirect_uri=self.redirect_uri,
                token_endpoint_auth_method="client_secret_post", timeout=10, trust_env=False,
            ) as client:
                token = await client.fetch_token(self.token_endpoint, code=code, code_verifier=verifier)
            async with httpx.AsyncClient(timeout=10, trust_env=False) as client:
                response = await client.get(self.jwks_endpoint)
                response.raise_for_status()
                keys = response.json()
            return {"id_token": token["id_token"], "keys": keys}
        except Exception:
            # Provider errors can contain codes, tokens or credentials.
            raise GoogleProviderError("Google authentication failed") from None
