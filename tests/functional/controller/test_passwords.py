import re
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from backend.controller.application import create_app
from backend.domain.passwords import PasswordHasher
from tests.conftest import verified_register

ORIGIN = {"Origin": "http://localhost:5173"}
EMAIL = "ana@example.com"
PASSWORD = "initial-password-123"


@pytest.fixture
def mailbox(settings, local_redis_url, monkeypatch):
    settings.redis_url = SecretStr(local_redis_url)
    settings.email = "sender@example.com"
    settings.password = SecretStr("test-admin-password")
    resend = Mock()
    resend.post.return_value = Mock(status_code=200, json=Mock(return_value={"id": "email-id"}))
    monkeypatch.setattr("backend.infra.connections.email.httpx.Client", Mock(return_value=resend))
    monkeypatch.setattr("backend.service.runtime.PasswordHasher", lambda: PasswordHasher(rounds=4))
    app = create_app(settings)
    with TestClient(app) as client:
        futures = []
        original_send = app.state.services.email.send
        def tracked_send(*args, **kwargs):
            future = original_send(*args, **kwargs)
            futures.append(future)
            return future
        app.state.services.email.send = tracked_send
        assert verified_register(client, headers=ORIGIN, json={"name": "Ana", "phone": "11999999999",
                           "email": EMAIL, "password": PASSWORD}).status_code == 201
        yield client, resend, futures


def code_from_mail(resend, futures):
    for future in futures:
        future.result(timeout=5)
    messages = [call.kwargs["json"] for call in resend.post.call_args_list
                if call.kwargs["json"]["subject"].startswith("Código")]
    assert len(messages) == 1
    assert messages[0]["to"] == [EMAIL]
    assert isinstance(messages[0]["text"], str)
    return re.search(r"[0-9]{8}", messages[0]["text"]).group()


def login(client):
    assert client.post("/auth/login", headers=ORIGIN, json={"email": EMAIL, "password": PASSWORD}).status_code == 200
    return {**ORIGIN, "X-CSRF-Token": client.get("/auth/csrf").json()["csrf_token"]}


def test_change_password_requires_csrf_current_password_and_revokes_cookie(mailbox):
    client, _, _ = mailbox
    headers = login(client)
    token = client.cookies.get("nexo_access_token")
    payload = {"current_password": PASSWORD, "new_password": "changed-password-123"}
    assert client.post("/auth/password/change", headers=ORIGIN, json=payload).status_code == 403
    assert client.post("/auth/password/change", headers=headers, json={**payload, "current_password": "wrong"}).status_code == 400
    assert client.post("/auth/password/change", headers=headers, json=payload).status_code == 204
    assert client.get("/auth/me").status_code == 401
    client.cookies.set("nexo_access_token", token)
    assert client.get("/auth/me").status_code == 401
    client.cookies.clear()
    assert client.post("/auth/login", headers=ORIGIN, json={"email": EMAIL, "password": "changed-password-123"}).status_code == 200


def test_recovery_email_thread_redis_and_single_use(mailbox):
    client, smtp, futures = mailbox
    login(client)
    old_token = client.cookies.get("nexo_access_token")
    client.cookies.clear()
    path = "/auth/password/recovery/request"
    unknown = client.post(path, headers=ORIGIN, json={"email": "missing@example.com"})
    known = client.post(path, headers=ORIGIN, json={"email": EMAIL})
    assert unknown.status_code == known.status_code == 202
    assert unknown.json() == known.json()
    assert client.post(path, headers=ORIGIN, json={"email": EMAIL}).status_code == 202
    code = code_from_mail(smtp, futures)
    assert code not in known.text and known.headers["cache-control"] == "no-store"
    repository = client.app.state.services.password_service.code_repository
    assert code not in str(repository.redis.hgetall(repository.key(EMAIL)))
    payload = {"email": EMAIL, "code": code, "new_password": "changed-password-123"}
    assert client.post("/auth/password/recovery/confirm", json=payload).status_code == 403
    result = client.post("/auth/password/recovery/confirm", headers=ORIGIN, json=payload)
    assert result.status_code == 204
    assert client.post("/auth/password/recovery/confirm", headers=ORIGIN, json=payload).status_code == 400
    client.cookies.set("nexo_access_token", old_token)
    assert client.get("/auth/me").status_code == 401
    client.cookies.clear()
    assert client.post("/auth/login", headers=ORIGIN, json={"email": EMAIL, "password": "changed-password-123"}).status_code == 200
    assert any(call.kwargs["json"]["subject"] == "Cadastro Nexo recebido"
               for call in smtp.post.call_args_list)


def test_recovery_errors_do_not_echo_secrets_and_fail_closed(mailbox, monkeypatch):
    from redis.exceptions import ConnectionError

    client, _, _ = mailbox
    response = client.post("/auth/password/recovery/confirm", headers=ORIGIN,
                           json={"email": EMAIL, "code": "12345678", "new_password": "tiny-secret"})
    assert response.status_code == 422
    assert "tiny-secret" not in response.text and "12345678" not in response.text
    repository = client.app.state.services.password_service.code_repository
    monkeypatch.setattr(repository, "issue", Mock(side_effect=ConnectionError("redis-secret-sentinel")))
    response = client.post("/auth/password/recovery/request", headers=ORIGIN, json={"email": EMAIL})
    assert response.status_code == 503 and "sentinel" not in response.text


def test_recovery_without_gmail_is_unavailable_for_every_address(settings):
    with TestClient(create_app(settings)) as client:
        for email in [EMAIL, "missing@example.com"]:
            assert client.post("/auth/password/recovery/request", headers=ORIGIN, json={"email": email}).status_code == 503
