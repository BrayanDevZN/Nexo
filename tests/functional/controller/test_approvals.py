from unittest.mock import AsyncMock
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from backend.controller.application import create_app
from backend.controller.dependencies import approved_user
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
    app = create_app(settings)
    app.get("/test/approved")(approved_user)
    return app


def login(client, email, password):
    assert client.post("/auth/login", json={"email": email, "password": password}, headers=ORIGIN).status_code == 200
    return {**ORIGIN, "X-CSRF-Token": client.get("/auth/csrf").json()["csrf_token"]}


@pytest.mark.parametrize("decision", ["approved", "rejected"])
def test_admin_decision_and_member_permissions(app, decision):
    with TestClient(app) as client:
        assert verified_register(client, json=DATA, headers=ORIGIN).status_code == 201
        login(client, DATA["email"], DATA["password"])
        member_cookie = client.cookies.get("nexo_access_token")
        assert client.get("/admin/users").status_code == 403
        assert client.get("/admin/notifications").status_code == 403
        assert client.get("/test/approved").status_code == 403
        headers = login(client, "owner@example.com", "initial-admin-password")
        listing = client.get("/admin/users", params={"status": "pending"})
        assert listing.headers["cache-control"] == "no-store"
        users = listing.json()
        assert len(users) == 1 and users[0]["email"] == "ana@example.com"
        assert "password_hash" not in users[0] and "google_sub" not in users[0]
        note = client.get("/admin/notifications", params={"unresolved_only": True}).json()[0]
        path = "/admin/notifications/" + note["id"]
        assert client.post(path + "/decision", json={"decision": decision}, headers=ORIGIN).status_code == 403
        read = client.patch(path + "/read", headers=headers)
        assert read.status_code == 200 and read.json()["read_at"]
        result = client.post(path + "/decision", json={"decision": decision}, headers=headers)
        assert result.status_code == 200 and result.json()["status"] == decision
        assert client.get("/admin/notifications", params={"unresolved_only": True}).json() == []
        assert client.post(path + "/decision", json={"decision": decision}, headers=headers).status_code == 409
        client.cookies.clear()
        client.cookies.set("nexo_access_token", member_cookie)
        if decision == "approved":
            assert client.get("/auth/me").json()["status"] == "approved"
            member_headers = {**ORIGIN, "X-CSRF-Token": client.get("/auth/csrf").json()["csrf_token"]}
            assert client.get("/test/approved").status_code == 200
            assert client.get("/admin/notifications").status_code == 403
            assert client.post(path + "/decision", json={"decision": "rejected"}, headers=member_headers).status_code == 403
        else:
            assert client.get("/auth/me").status_code == 401
            client.cookies.clear()
            assert client.post("/auth/login", json={"email": DATA["email"], "password": DATA["password"]}, headers=ORIGIN).status_code == 401


def test_notifications_are_owned_and_pagination_is_bounded(app):
    with TestClient(app) as client:
        assert client.get("/admin/notifications").status_code == 401
        headers = login(client, "owner@example.com", "initial-admin-password")
        assert client.get("/admin/users", params={"limit": 101}).status_code == 422
        assert client.get("/admin/users", params={"status": "admin"}).status_code == 422
        assert client.patch("/admin/notifications/missing/read", headers=headers).status_code == 404
        with app.state.services.repositories.transaction() as repos:
            user = repos.users.create(name="Other", email="other@example.com", google_sub="other-google")
            foreign = repos.notifications.create_approval_request(recipient_id=user.id, requested_user_id=user.id)
        path = "/admin/notifications/" + foreign.id
        assert client.patch(path + "/read", headers=headers).status_code == 404
        assert client.post(path + "/decision", json={"decision": "approved"}, headers=headers).status_code == 404
        assert client.get("/admin/notifications").json() == []


def test_google_registration_also_notifies_admin(app, google_signer):
    app.state.settings.google_client_id = "test-google-client"
    app.state.settings.google_client_secret = SecretStr("test-google-secret")
    with TestClient(app) as client:
        sign, keys = google_signer
        app.state.services.google.provider.exchange = AsyncMock(side_effect=lambda code, verifier, nonce: {
            "id_token": sign(nonce=nonce), "keys": keys})
        response = client.get("/auth/google/login", follow_redirects=False)
        state = parse_qs(urlsplit(response.headers["location"]).query)["state"][0]
        assert client.get("/auth/google/callback", params={"state": state, "code": "test-code"}, follow_redirects=False).status_code == 302
        csrf = client.get("/auth/google/profile").json()["csrf_token"]
        assert client.post("/auth/google/complete", json={"name": "Ana", "phone": "11999999999"}, headers={**ORIGIN, "X-CSRF-Token": csrf}).status_code == 201
        login(client, "owner@example.com", "initial-admin-password")
        notes = client.get("/admin/notifications").json()
        assert len(notes) == 1
        assert notes[0]["requested_user_id"] == client.get("/admin/users", params={"status": "pending"}).json()[0]["id"]
