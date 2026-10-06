from concurrent.futures import Future
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from backend.controller.application import create_app
from backend.domain.passwords import PasswordHasher
from tests.conftest import verified_register
from tests.functional.controller.test_members import DATA, ORIGIN, login


@pytest.fixture
def app(settings, local_redis_url, monkeypatch):
    settings.redis_url = SecretStr(local_redis_url)
    settings.email = "owner@example.com"
    settings.password = SecretStr("initial-admin-password")
    monkeypatch.setattr("backend.service.runtime.PasswordHasher", lambda: PasswordHasher(rounds=4))
    return create_app(settings)


def test_deletion_requires_email_confirmation_session_and_csrf(app):
    with TestClient(app) as client:
        assert verified_register(client, json=DATA, headers=ORIGIN).status_code == 201
        assert client.get("/auth/me").status_code == 200  # Signup issues a session without /login.
        actor = client.get("/auth/me").json()
        done = Future()
        done.set_result(None)
        deletion = app.state.services.account_deletion
        deletion.sender = Mock(configured=True, send=Mock(return_value=done))
        deletion.codes.create = Mock(return_value="12345678")
        headers = {**ORIGIN, "X-CSRF-Token": client.get("/auth/csrf").json()["csrf_token"]}
        assert client.post("/auth/account/deletion/request", headers=ORIGIN).status_code == 403
        assert client.post("/auth/account/deletion/request", headers=headers, json={"email": "other@example.com"}).status_code == 202
        assert deletion.sender.send.call_args.args[0] == DATA["email"]
        assert client.post("/auth/account/deletion/confirm", headers=headers, json={"code": "00000000"}).status_code == 400
        assert client.post("/auth/account/deletion/confirm", headers=headers, json={"code": "12345678", "user_id": "other"}).status_code == 422
        response = client.post("/auth/account/deletion/confirm", headers=headers, json={"code": "12345678"})
        assert response.status_code == 204 and "Max-Age=0" in response.headers["set-cookie"]
        assert client.get("/auth/me").status_code == 401
        with app.state.services.repositories.transaction() as repos:
            assert repos.users.get(actor["id"]) is None
        headers = login(client)
        assert client.post("/auth/account/deletion/request", headers=headers).status_code == 409
