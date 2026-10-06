import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from backend.controller.application import create_app
from backend.controller.dependencies import admin_user, approved_user
from backend.domain.passwords import PasswordHasher
from tests.conftest import verified_register

ORIGIN = {"Origin": "http://localhost:5173"}
DATA = {"name": "Ana", "phone": "+55 (11) 99999-9999", "email": "ana@example.com",
        "password": "strong-password-123"}


@pytest.fixture
def client(settings, local_redis_url, monkeypatch):
    settings.redis_url = SecretStr(local_redis_url)
    monkeypatch.setattr("backend.service.runtime.PasswordHasher", lambda: PasswordHasher(rounds=4))
    app = create_app(settings)
    # Protected probes verify dependencies without exposing business routes yet.
    app.get("/test/approved")(approved_user)
    app.get("/test/admin")(admin_user)
    with TestClient(app) as test_client:
        yield test_client


def register_and_login(client):
    assert verified_register(client, json=DATA, headers=ORIGIN).status_code == 201
    response = client.post("/auth/login", json={"email": DATA["email"],
                           "password": DATA["password"]}, headers=ORIGIN)
    assert response.status_code == 200
    return response


def test_cookie_login_pending_permissions_and_logout_revocation(client):
    response = register_and_login(client)
    assert response.json()["status"] == "pending"
    assert response.json()["role"] == "member"
    assert not {"password_hash", "token", "access_token", "session_version", "google_sub"} & response.json().keys()
    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie and "SameSite=lax" in cookie and "Path=/" in cookie
    assert response.headers["cache-control"] == "no-store"
    token = client.cookies.get("nexo_access_token")
    assert client.get("/auth/me").status_code == 200
    assert client.get("/test/approved").status_code == 403
    assert client.get("/test/admin").status_code == 403
    assert client.post("/auth/logout", headers=ORIGIN).status_code == 403
    csrf = client.get("/auth/csrf").json()["csrf_token"]
    result = client.post("/auth/logout", headers={**ORIGIN, "X-CSRF-Token": csrf})
    assert result.status_code == 204 and not result.content
    assert "Max-Age=0" in result.headers["set-cookie"]
    assert client.get("/auth/me").status_code == 401
    client.cookies.set("nexo_access_token", token)
    assert client.get("/auth/me").status_code == 401


def test_origin_validation_and_secret_safe_errors(client):
    assert client.post("/auth/register", json=DATA).status_code == 403
    assert client.post("/auth/register", json=DATA, headers={"Origin": "https://evil.example"}).status_code == 403
    response = client.post("/auth/register", json={**DATA, "password": "secret-short", "role": "admin"}, headers=ORIGIN)
    assert response.status_code == 422
    assert "secret-short" not in response.text and '"input"' not in response.text
    register_and_login(client)
    assert client.post("/auth/register", json=DATA, headers=ORIGIN).status_code == 409
    assert client.post("/auth/logout", headers={**ORIGIN, "X-CSRF-Token": "forged"}).status_code == 403
    assert client.get("/auth/me").status_code == 200


def test_authorization_header_cannot_replace_cookie(client):
    register_and_login(client)
    token = client.cookies.get("nexo_access_token")
    client.cookies.clear()
    assert client.get("/auth/me", headers={"Authorization": "Bearer " + token}).status_code == 401
    client.cookies.set("nexo_access_token", "corrupted")
    assert client.get("/auth/me").status_code == 401


def test_csrf_from_old_session_cannot_logout_new_session(client):
    register_and_login(client)
    csrf = client.get("/auth/csrf").json()["csrf_token"]
    response = client.post("/auth/login", json={"email": DATA["email"], "password": DATA["password"]}, headers=ORIGIN)
    assert response.status_code == 200
    assert client.post("/auth/logout", headers={**ORIGIN, "X-CSRF-Token": csrf}).status_code == 403


def test_secure_cookie_and_admin_startup(settings, local_redis_url, monkeypatch):
    settings.redis_url = SecretStr(local_redis_url)
    settings.cookie_secure = True
    settings.email = "owner@example.com"
    settings.password = SecretStr("initial-admin-password")
    monkeypatch.setattr("backend.service.runtime.PasswordHasher", lambda: PasswordHasher(rounds=4))
    for _ in range(2):
        with TestClient(create_app(settings), base_url="https://testserver") as client:
            response = client.post("/auth/login", headers=ORIGIN,
                                   json={"email": "owner@example.com", "password": "initial-admin-password"})
            assert response.status_code == 200
            assert response.json()["role"] == "admin"
            assert "Secure" in response.headers["set-cookie"]
            assert client.get("/auth/me").status_code == 200
