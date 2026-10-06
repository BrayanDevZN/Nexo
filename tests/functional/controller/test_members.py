import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from backend.controller.application import create_app
from backend.domain.passwords import PasswordHasher
from tests.conftest import verified_register

ORIGIN = {"Origin": "http://localhost:5173"}
DATA = {"name": "Ana", "phone": "11999999999", "email": "ana@example.com",
        "password": "strong-password-123"}


@pytest.fixture
def app(settings, local_redis_url, monkeypatch):
    settings.redis_url = SecretStr(local_redis_url)
    settings.email = "owner@example.com"
    settings.password = SecretStr("initial-admin-password")
    monkeypatch.setattr("backend.service.runtime.PasswordHasher", lambda: PasswordHasher(rounds=4))
    return create_app(settings)


def login(client, email="owner@example.com", password="initial-admin-password"):
    assert client.post("/auth/login", json={"email": email, "password": password}, headers=ORIGIN).status_code == 200
    return {**ORIGIN, "X-CSRF-Token": client.get("/auth/csrf").json()["csrf_token"]}


def test_admin_member_lifecycle_and_access_boundaries(app):
    with TestClient(app) as client:
        assert client.get("/admin/users").status_code == 401
        assert verified_register(client, json=DATA, headers=ORIGIN).status_code == 201
        user = client.get("/auth/me").json()
        path = "/admin/users/" + user["id"]
        member_headers = {**ORIGIN, "X-CSRF-Token": client.get("/auth/csrf").json()["csrf_token"]}
        assert client.patch(path, json={"role": "admin"}, headers=member_headers).status_code == 403
        assert client.delete(path, headers=member_headers).status_code == 403
        headers = login(client)
        principal = client.get("/auth/me").json()
        assert client.patch(path, json={"role": "admin"}, headers=headers).status_code == 409
        note = client.get("/admin/notifications").json()[0]
        assert client.post("/admin/notifications/" + note["id"] + "/decision",
                           json={"decision": "approved"}, headers=headers).status_code == 200
        assert client.patch(path, json={"role": "admin"}, headers=ORIGIN).status_code == 403
        for body in ({}, {"status": "approved"}, {"password": "changed"}, {"role": "root"}):
            assert client.patch(path, json=body, headers=headers).status_code == 422
        result = client.patch(path, json={"role": "admin", "name": "Ana Admin", "phone": None}, headers=headers)
        assert result.status_code == 200 and result.json()["role"] == "admin"
        assert result.json()["name"] == "Ana Admin" and result.json()["phone"] is None
        assert "password_hash" not in result.json()
        headers = login(client, DATA["email"], DATA["password"])
        assert client.get("/admin/users").status_code == 200
        assert client.delete("/admin/users/" + principal["id"], headers=headers).status_code == 409
        assert client.delete(path, headers=headers).status_code == 409
        assert client.patch(path, json={"role": "member"}, headers=headers).status_code == 409
        headers = login(client)
        assert client.patch(path, json={"email": "new@example.com"}, headers=headers).status_code == 200
        assert client.patch("/admin/users/missing", json={"name": "Missing"}, headers=headers).status_code == 404
        assert client.delete(path, headers=headers).status_code == 204
        assert client.get("/admin/users", params={"status": "approved"}).json()[0]["is_principal"]
        assert client.delete(path, headers=headers).status_code == 404
