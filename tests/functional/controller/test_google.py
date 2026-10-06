from unittest.mock import AsyncMock
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from backend.controller.application import create_app
from backend.domain.passwords import PasswordHasher
from tests.conftest import verified_register

ORIGIN = {"Origin": "http://localhost:5173"}


@pytest.fixture
def client(settings, local_redis_url, monkeypatch, google_signer):
    settings.redis_url = SecretStr(local_redis_url)
    settings.google_client_id = "test-google-client"
    settings.google_client_secret = SecretStr("test-google-secret")
    monkeypatch.setattr("backend.service.runtime.PasswordHasher", lambda: PasswordHasher(rounds=4))
    app = create_app(settings)
    with TestClient(app) as client:
        provider = app.state.services.google.provider
        sign, keys = google_signer
        provider.exchange = AsyncMock(side_effect=lambda code, verifier, nonce: {
            "id_token": sign(nonce=nonce), "keys": keys})
        yield client


def start(client):
    response = client.get("/auth/google/login", follow_redirects=False)
    assert response.status_code == 302
    assert "HttpOnly" in response.headers["set-cookie"]
    query = parse_qs(urlsplit(response.headers["location"]).query)
    return query["state"][0]


def callback(client, state):
    return client.get("/auth/google/callback", params={"state": state, "code": "test-code"}, follow_redirects=False)


def test_new_google_user_must_complete_profile_then_stays_pending(client):
    state = start(client)
    response = callback(client, state)
    assert response.status_code == 302
    assert response.headers["location"].endswith("/admin/complete-profile")
    assert client.get("/auth/me").status_code == 401
    profile = client.get("/auth/google/profile")
    assert profile.json()["email"] == "ana@example.com"
    assert profile.headers["cache-control"] == "no-store"
    assert client.post("/auth/google/complete", json={"name": "Ana", "phone": "11999999999"}, headers=ORIGIN).status_code == 401
    headers = {**ORIGIN, "X-CSRF-Token": profile.json()["csrf_token"]}
    response = client.post("/auth/google/complete", json={"name": "Ana", "phone": "11999999999"}, headers=headers)
    assert response.status_code == 201
    assert response.json()["status"] == "pending" and response.json()["role"] == "member"
    assert response.json()["phone"] == "+11999999999"
    assert "HttpOnly" in response.headers["set-cookie"]
    assert client.get("/auth/me").status_code == 200
    assert client.get("/auth/google/profile").status_code == 401
    with client.app.state.services.repositories.transaction() as repos:
        user = repos.users.by_email("ana@example.com")
        assert user.google_sub == "google-user-123" and user.password_hash is None
    response = callback(client, start(client))
    assert response.status_code == 302
    assert response.headers["location"].endswith("/admin")
    assert "nexo_google_profile=" not in response.headers["set-cookie"]


def test_callback_rejects_wrong_browser_and_replay(client):
    state = start(client)
    cookie = client.cookies.get("nexo_google_flow")
    client.cookies.clear()
    assert callback(client, state).status_code == 401
    client.app.state.services.google.provider.exchange.assert_not_awaited()
    client.cookies.set("nexo_google_flow", cookie, path="/auth/google")
    assert callback(client, state).status_code == 302
    client.cookies.set("nexo_google_flow", cookie, path="/auth/google")
    assert callback(client, state).status_code == 401
    client.app.state.services.google.provider.exchange.assert_awaited_once()


def test_google_does_not_auto_link_local_account(client):
    assert verified_register(client, json={"name": "Ana", "phone": "11999999999",
                       "email": "ana@example.com", "password": "strong-password-123"}, headers=ORIGIN).status_code == 201
    client.cookies.clear()
    assert callback(client, start(client)).status_code == 409
    assert client.get("/auth/me").status_code == 401
    with client.app.state.services.repositories.transaction() as repos:
        assert repos.users.by_email("ana@example.com").google_sub is None


def test_profile_requires_phone_origin_and_forbids_admin_fields(client):
    assert callback(client, start(client)).status_code == 302
    csrf = client.get("/auth/google/profile").json()["csrf_token"]
    assert client.post("/auth/google/complete", json={"name": "Ana", "phone": "11999999999"}, headers={"X-CSRF-Token": csrf}).status_code == 403
    headers = {**ORIGIN, "X-CSRF-Token": csrf}
    assert client.post("/auth/google/complete", json={"name": "Ana"}, headers=headers).status_code == 422
    assert client.post("/auth/google/complete", json={"name": "Ana", "phone": "11999999999", "role": "admin"}, headers=headers).status_code == 422
    with client.app.state.services.repositories.transaction() as repos:
        assert repos.users.by_email("ana@example.com") is None


def test_rejected_google_account_cannot_login(client):
    with client.app.state.services.repositories.transaction() as repos:
        repos.users.create(name="Ana", email="ana@example.com", phone="11999999999",
                           google_sub="google-user-123", status="rejected")
    assert callback(client, start(client)).status_code == 401
    assert client.get("/auth/me").status_code == 401


def test_google_without_credentials_is_disabled(settings):
    with TestClient(create_app(settings)) as client:
        assert client.get("/auth/google/login", follow_redirects=False).status_code == 503
