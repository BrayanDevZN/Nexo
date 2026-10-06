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


def test_shared_directory_filters_sensitive_fields_and_enforces_approval(app):
    with TestClient(app) as client:
        assert client.get("/members").status_code == 401
        assert verified_register(client, json=DATA, headers=ORIGIN).status_code == 201
        assert client.get("/members").status_code == 403
        user = client.get("/auth/me").json()
        headers = login(client)
        note = client.get("/admin/notifications").json()[0]
        assert client.post("/admin/notifications/" + note["id"] + "/decision",
                           json={"decision": "approved"}, headers=headers).status_code == 200
        with app.state.services.repositories.transaction() as repos:
            hashed = repos.users.get(user["id"]).password_hash
            repos.users.create(name="Pending", email="pending@example.com", google_sub="pending-google")
        admin_response = client.get("/admin/users")
        assert hashed not in admin_response.text
        assert all(not {"password", "password_hash", "google_sub", "session_version"} & row.keys()
                   for row in admin_response.json())
        login(client, DATA["email"], DATA["password"])
        response = client.get("/members")
        assert response.status_code == 200 and response.headers["cache-control"] == "no-store"
        assert {row["name"] for row in response.json()} == {"Ana", app.state.settings.admin_name}
        assert all(set(row) == {"id", "name", "role", "has_photo"} for row in response.json())
        assert DATA["email"] not in response.text and DATA["password"] not in response.text and hashed not in response.text
        assert client.get("/members", params={"limit": 101}).status_code == 422
        assert len(client.get("/members", params={"limit": 1, "offset": 1}).json()) == 1
        assert client.get("/admin/users").status_code == 403
