from unittest.mock import Mock

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


def login(client):
    response = client.post("/auth/login", headers=ORIGIN,
                           json={"email": "owner@example.com", "password": "initial-admin-password"})
    assert response.status_code == 200
    return {**ORIGIN, "X-CSRF-Token": client.get("/auth/csrf").json()["csrf_token"]}


def test_n8n_request_is_notified_invite_email_and_notification(client, monkeypatch):
    headers = login(client)
    services = client.app.state.services
    email = Mock(return_value=True)
    push = Mock()
    monkeypatch.setattr(services.messages, "automation_invitation", email)
    monkeypatch.setattr(services.push, "notify_users", push)

    created = client.post("/automation-requests", headers=headers,
                          json={"details": "Automatizar o cadastro de leads"})
    assert created.status_code == 201
    request_id = created.json()["id"]
    notices = client.get("/notifications", headers=headers).json()
    request_notice = next(item for item in notices if item["kind"] == "automation_request")
    assert "Automatizar o cadastro de leads" in request_notice["body"]

    duplicate = client.post("/automation-requests", headers=headers, json={})
    assert duplicate.status_code == 409

    link = "https://n8n.nexoaicompany.com/signup?token=secret-invite"
    invited = client.post(f"/automation-requests/{request_id}/invite", headers=headers, json={
        "invite_url": link,
        "message": "Olá! Sua conta foi liberada para os fluxos da Nexo.",
    })
    assert invited.status_code == 200
    assert invited.json()["status"] == "invited"
    email.assert_called_once()
    assert email.call_args.args[1:] == (
        link, "Olá! Sua conta foi liberada para os fluxos da Nexo.",
    )

    notices = client.get("/notifications", headers=headers).json()
    invitation = next(item for item in notices if item["kind"] == "automation_invitation")
    assert link in invitation["body"]
    assert client.patch(f"/notifications/{invitation['id']}/read", headers=headers).status_code == 200
    listed = client.get("/automation-requests", headers=headers).json()
    assert listed[0]["status"] == "invited"
    assert listed[0]["invite_url"] == link
    push.assert_called()


def test_admin_can_reject_request_and_bad_invite_domain_is_rejected(client, monkeypatch):
    headers = login(client)
    services = client.app.state.services
    monkeypatch.setattr(services.messages, "automation_invitation", Mock(return_value=True))
    created = client.post("/automation-requests", headers=headers, json={})
    request_id = created.json()["id"]

    bad_link = client.post(f"/automation-requests/{request_id}/invite", headers=headers, json={
        "invite_url": "https://n8n.nexoaicompany.com.attacker.test/invite",
    })
    assert bad_link.status_code == 422
    assert client.get("/automation-requests", headers=headers).json()[0]["status"] == "pending"

    response = client.post(f"/automation-requests/{request_id}/reject", headers=headers,
                           json={"message": "Vamos rever os acessos no próximo ciclo."})
    assert response.status_code == 200
    assert response.json()["status"] == "rejected"
    notices = client.get("/notifications", headers=headers).json()
    notice = next(item for item in notices if item["kind"] == "automation_rejected")
    assert "próximo ciclo" in notice["body"]
    assert client.post(f"/automation-requests/{request_id}/reject", headers=headers,
                       json={}).status_code == 409
