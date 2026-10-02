from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from redis.exceptions import ConnectionError

from backend.controller.application import create_app
from backend.domain.passwords import PasswordHasher

ORIGIN = {"Origin": "http://localhost:5173"}


@pytest.fixture
def app(settings, local_redis_url, monkeypatch):
    settings.redis_url = SecretStr(local_redis_url)
    monkeypatch.setattr("backend.service.runtime.PasswordHasher", lambda: PasswordHasher(rounds=4))
    return create_app(settings)


def test_shared_auth_budget_blocks_next_endpoint_and_forwarded_header_does_not_bypass(app):
    app.state.settings.auth_rate_limit = 2
    with TestClient(app) as client:
        for _ in range(2):
            assert client.post("/auth/login", headers=ORIGIN,
                               json={"email": "missing@example.com", "password": "incorrect"}).status_code == 401
        response = client.post("/auth/register", headers={**ORIGIN, "X-Forwarded-For": "1.2.3.4"},
                               json={"name": "Ana", "phone": "11999999999", "email": "ana@example.com",
                                     "password": "strong-password-123"})
        assert response.status_code == 429
        assert 1 <= int(response.headers["retry-after"]) <= 60
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["access-control-allow-origin"] == ORIGIN["Origin"]
        assert "Retry-After" in response.headers["access-control-expose-headers"]
        with app.state.services.repositories.transaction() as repos:
            assert repos.users.by_email("ana@example.com") is None


def test_parameterized_ids_share_one_route_counter(app):
    app.state.settings.rate_limit = 2
    with TestClient(app) as client:
        assert client.get("/clients/one").status_code == 401
        assert client.get("/clients/two", params={"cachebust": "anything"}).status_code == 401
        assert client.get("/clients/three").status_code == 429
        assert client.get("/clients").status_code == 401
        assert client.get("/health").status_code == 200


def test_global_budget_applies_across_routes_and_clients(app):
    app.state.settings.global_rate_limit = 2
    with TestClient(app, client=("192.0.2.1", 1234)) as client:
        assert client.get("/auth/me").status_code == 401
        assert client.get("/clients").status_code == 401
        # Same runtime, another ASGI peer; global budget is application-wide.
        with TestClient(app, client=("192.0.2.2", 1234)) as other:
            assert other.get("/unknown-route").status_code == 429
            assert other.get("/health").status_code == 200
            assert other.get("/health/ready").status_code == 200


def test_redis_failure_fails_closed_and_does_not_block_probes_or_preflight(app, monkeypatch):
    with TestClient(app) as client:
        monkeypatch.setattr(app.state.services.rate_limits.repository, "check",
                            Mock(side_effect=ConnectionError("redis-secret-sentinel")))
        response = client.get("/clients")
        assert response.status_code == 503 and "sentinel" not in response.text
        assert response.headers["cache-control"] == "no-store"
        assert client.get("/health").status_code == 200
        assert client.get("/health/ready").status_code == 200
        preflight = client.options("/clients", headers={**ORIGIN,
                                  "Access-Control-Request-Method": "POST"})
        assert preflight.status_code == 200


def test_environment_flags_are_read_and_enforced(settings, local_redis_url, monkeypatch):
    from backend.infra.config.settings import Settings

    monkeypatch.setenv("GLOBAL_RATE_LIMIT", "1")
    monkeypatch.setenv("GLOBAL_RATE_LIMIT_WINDOW_SECONDS", "30")
    monkeypatch.setenv("RATE_LIMIT", "10")
    monkeypatch.setenv("RATE_LIMIT_WINDOW_SECONDS", "40")
    monkeypatch.setenv("AUTH_RATE_LIMIT", "10")
    monkeypatch.setenv("AUTH_RATE_LIMIT_WINDOW_SECONDS", "50")
    config = Settings(_env_file=None, environment="test", redis_url=local_redis_url,
                      database_url=settings.database_url, jwt_secret_key=settings.jwt_secret_key)
    monkeypatch.setattr("backend.service.runtime.PasswordHasher", lambda: PasswordHasher(rounds=4))
    with TestClient(create_app(config)) as client:
        assert client.get("/auth/me").status_code == 401
        response = client.get("/clients")
        assert response.status_code == 429
        assert 1 <= int(response.headers["retry-after"]) <= 30
