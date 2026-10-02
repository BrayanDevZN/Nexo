import asyncio
from urllib.parse import parse_qs

import httpx
import pytest
from pydantic import SecretStr

from backend.infra.connections.google import GoogleConnection, GoogleProviderError


def test_actual_oauth_client_with_mock_google_endpoints(settings, google_signer, monkeypatch):
    from authlib.integrations.httpx_client import AsyncOAuth2Client

    sign, keys = google_signer
    settings.google_client_id = "test-google-client"
    settings.google_client_secret = SecretStr("test-google-secret")
    requests = []

    def handle(request):
        requests.append(request)
        if str(request.url) == GoogleConnection.token_endpoint:
            body = parse_qs(request.content.decode())
            assert body["code"] == ["test-code"]
            assert body["code_verifier"] == ["test-verifier"]
            assert body["client_secret"] == ["test-google-secret"]
            return httpx.Response(200, json={"access_token": "test-access", "token_type": "Bearer",
                                             "id_token": sign()})
        assert str(request.url) == GoogleConnection.jwks_endpoint
        return httpx.Response(200, json=keys)

    transport = httpx.MockTransport(handle)
    real_http_client = httpx.AsyncClient
    monkeypatch.setattr("backend.infra.connections.google.AsyncOAuth2Client",
                        lambda *args, **kwargs: AsyncOAuth2Client(*args, transport=transport, **kwargs))
    monkeypatch.setattr("backend.infra.connections.google.httpx.AsyncClient",
                        lambda **kwargs: real_http_client(transport=transport, **kwargs))
    packet = asyncio.run(GoogleConnection(settings).exchange("test-code", "test-verifier", "test-nonce"))
    assert packet["keys"] == keys
    assert packet["id_token"]
    assert len(requests) == 2


def test_google_provider_error_hides_sensitive_response(settings, monkeypatch):
    settings.google_client_id = "test-client"
    settings.google_client_secret = SecretStr("secret-sentinel")

    def fail(*args, **kwargs):
        raise ValueError("secret-sentinel test-code")
    monkeypatch.setattr("backend.infra.connections.google.AsyncOAuth2Client", fail)
    with pytest.raises(GoogleProviderError) as exc:
        asyncio.run(GoogleConnection(settings).exchange("test-code", "verifier", "nonce"))
    assert "sentinel" not in str(exc.value) and "test-code" not in str(exc.value)
