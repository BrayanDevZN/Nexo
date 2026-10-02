import base64
import hashlib
from urllib.parse import parse_qs, urlsplit

from pydantic import SecretStr

from backend.infra.connections.google import GoogleConnection


def test_authorization_url_uses_pkce_without_client_secret(settings):
    settings.google_client_id = "test-client"
    settings.google_client_secret = SecretStr("secret-sentinel")
    url = GoogleConnection(settings).authorization_url("state", "nonce", "verifier")
    query = parse_qs(urlsplit(url).query)
    expected = base64.urlsafe_b64encode(hashlib.sha256(b"verifier").digest()).rstrip(b"=").decode()
    assert query["code_challenge"] == [expected]
    assert query["code_challenge_method"] == ["S256"]
    assert query["state"] == ["state"] and query["nonce"] == ["nonce"]
    assert query["scope"] == ["openid email profile"]
    assert "secret-sentinel" not in url
