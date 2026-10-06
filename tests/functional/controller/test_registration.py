import re
from unittest.mock import Mock

from fastapi.testclient import TestClient
from pydantic import SecretStr

from backend.controller.application import create_app
from backend.domain.passwords import PasswordHasher

ORIGIN = {"Origin": "http://localhost:5173"}
DATA = {
    "name": "Ana",
    "phone": "11999999999",
    "email": "ana@example.com",
    "password": "initial-password-123",
}


def test_email_confirmation_precedes_creation_notification_and_login(
    settings, local_redis_url, monkeypatch
):
    settings.redis_url = SecretStr(local_redis_url)
    settings.email = "owner@example.com"
    settings.password = SecretStr("initial-admin-password")
    smtp = Mock()
    monkeypatch.setattr("backend.infra.connections.email.yagmail.SMTP", Mock(return_value=smtp))
    monkeypatch.setattr("backend.service.runtime.PasswordHasher", lambda: PasswordHasher(rounds=4))
    with TestClient(create_app(settings)) as client:
        services = client.app.state.services
        futures = []
        send = services.email.send

        def tracked(*args):
            future = send(*args)
            futures.append(future)
            return future

        services.email.send = tracked
        assert client.post("/auth/register", headers=ORIGIN, json=DATA).status_code == 202
        for future in futures:
            future.result(timeout=5)
        with services.repositories.transaction() as repos:
            assert repos.users.by_email(DATA["email"]) is None
            assert not repos.notifications.list_for_recipient(repos.users.principal_admin().id)
        assert (
            client.post(
                "/auth/login",
                headers=ORIGIN,
                json={"email": DATA["email"], "password": DATA["password"]},
            ).status_code
            == 401
        )
        mail = smtp.send.call_args_list[0].kwargs
        assert mail["to"] == DATA["email"]
        code = re.search(r"[0-9]{8}", str(mail["contents"])).group()
        repository = services.registration.repository
        cached = str(repository.redis.hgetall(repository.key(DATA["email"])))
        assert DATA["password"] not in cached and code not in cached
        payload = {"email": DATA["email"], "code": code}
        assert (
            client.post(
                "/auth/register/confirm",
                headers=ORIGIN,
                json={**payload, "code": "00000000" if code != "00000000" else "11111111"},
            ).status_code
            == 400
        )
        response = client.post("/auth/register/confirm", headers=ORIGIN, json=payload)
        assert response.status_code == 201 and response.json()["status"] == "pending"
        assert "password_hash" not in response.text
        assert "HttpOnly" in response.headers["set-cookie"]
        assert client.get("/auth/me").json()["email"] == DATA["email"]
        with services.repositories.transaction() as repos:
            assert (
                len(repos.notifications.list_for_recipient(repos.users.principal_admin().id)) == 1
            )
        assert (
            client.post("/auth/register/confirm", headers=ORIGIN, json=payload).status_code == 400
        )
        assert (
            client.post(
                "/auth/login",
                headers=ORIGIN,
                json={"email": DATA["email"], "password": DATA["password"]},
            ).status_code
            == 200
        )


def test_unconfigured_sender_never_creates_user(settings):
    with TestClient(create_app(settings)) as client:
        assert client.post("/auth/register", headers=ORIGIN, json=DATA).status_code == 503
        with client.app.state.services.repositories.transaction() as repos:
            assert repos.users.by_email(DATA["email"]) is None
