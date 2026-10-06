import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from backend.controller.application import create_app
from backend.domain.passwords import PasswordHasher

ORIGIN = {"Origin": "http://localhost:5173"}


@pytest.fixture
def client(settings, local_redis_url, monkeypatch):
    settings.redis_url = SecretStr(local_redis_url)
    settings.email = "owner@example.com"
    settings.password = SecretStr("initial-admin-password")
    monkeypatch.setattr("backend.service.runtime.PasswordHasher", lambda: PasswordHasher(rounds=4))
    with TestClient(create_app(settings)) as test_client:
        yield test_client


def test_dashboard_returns_compact_overview_and_refreshes_after_a_client_change(client):
    login = client.post("/auth/login", headers=ORIGIN, json={
        "email": "owner@example.com", "password": "initial-admin-password",
    })
    assert login.status_code == 200
    overview = client.get("/dashboard")
    assert overview.status_code == 200
    assert overview.json()["clients_count"] == 0
    token = client.get("/auth/csrf").json()["csrf_token"]
    created = client.post("/clients", headers={**ORIGIN, "X-CSRF-Token": token}, json={
        "name": "Loja", "niche": "Varejo", "contract_closed": False,
        "pipeline_stage": "lead",
    })
    assert created.status_code == 201
    refreshed = client.get("/dashboard")
    assert refreshed.status_code == 200
    data = refreshed.json()
    assert data["clients_count"] == 1 and len(data["contracts_by_month"]) == 5
    assert all(secret not in str(data) for secret in ("password_hash", "profile_photo_data", "content"))
