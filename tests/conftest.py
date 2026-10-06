import pytest
from pydantic import SecretStr

from backend.infra.config.settings import Settings, get_settings


@pytest.fixture(autouse=True)
def isolated_environment(monkeypatch):
    # Tests never read real credentials or depend on the developer's environment.
    for key in Settings.model_fields:
        monkeypatch.delenv(key.upper(), raising=False)
    monkeypatch.setitem(Settings.model_config, "env_file", None)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def settings(tmp_path):
    return Settings(
        _env_file=None,
        environment="test",
        jwt_secret_key="test-only-key-" * 4,
        resend_key=SecretStr("test-resend-key"),
        database_url="sqlite:///" + str(tmp_path / "nested" / "nexo.db"),
    )


@pytest.fixture
def local_redis_url():
    import os
    from urllib.parse import urlsplit

    url = os.getenv("REDIS_TEST_URL")
    if not url:
        pytest.skip("Set REDIS_TEST_URL to a local test Redis (required in CI)")
    if urlsplit(url).hostname not in {"localhost", "127.0.0.1", "redis"}:
        pytest.fail("Integration tests only allow local Redis hosts")
    return url


@pytest.fixture
def google_signer():
    import json
    import time

    import jwt
    from cryptography.hazmat.primitives.asymmetric import rsa

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key()))
    public.update(kid="test-key", alg="RS256", use="sig")

    def sign(**overrides):
        claims = {
            "sub": "google-user-123",
            "email": "ana@example.com",
            "name": "Ana",
            "email_verified": True,
            "iss": "https://accounts.google.com",
            "aud": "test-google-client",
            "nonce": "test-nonce",
            "iat": int(time.time()),
            "exp": int(time.time()) + 300,
        }
        claims.update(overrides)
        return jwt.encode(claims, key, algorithm="RS256", headers={"kid": "test-key"})

    return sign, {"keys": [public]}


def verified_register(client, *, json, headers):
    """Exercise the verification endpoints with a test-only mail transport."""
    from concurrent.futures import Future
    from unittest.mock import Mock, patch

    service = client.app.state.services.registration
    done = Future()
    done.set_result(None)
    with (
        patch.object(service, "sender", Mock(configured=True, send=Mock(return_value=done))),
        patch.object(service.codes, "create", return_value="12345678"),
    ):
        response = client.post("/auth/register", json=json, headers=headers)
    if response.status_code != 202:
        return response
    return client.post(
        "/auth/register/confirm", headers=headers, json={"email": json["email"], "code": "12345678"}
    )
