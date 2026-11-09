from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from pydantic import SecretStr

from backend.controller.application import create_app
from backend.domain.passwords import PasswordHasher
from tests.conftest import verified_register

ORIGIN = {"Origin": "http://localhost:5173"}
DATA = {"name": "Ana", "phone": "11999999999", "email": "ana@example.com",
        "password": "strong-password-123"}


@pytest.fixture
def client(settings, local_redis_url, monkeypatch, tmp_path):
    settings.redis_url = SecretStr(local_redis_url)
    settings.upload_dir = tmp_path / "photos"
    settings.email = "owner@example.com"
    settings.password = SecretStr("initial-admin-password")
    monkeypatch.setattr("backend.service.runtime.PasswordHasher", lambda: PasswordHasher(rounds=4))
    with TestClient(create_app(settings)) as client:
        yield client


def login(client, email="owner@example.com", password="initial-admin-password"):
    assert client.post("/auth/login", headers=ORIGIN, json={"email": email, "password": password}).status_code == 200
    return {**ORIGIN, "X-CSRF-Token": client.get("/auth/csrf").json()["csrf_token"]}


def photo():
    output = BytesIO()
    Image.new("RGB", (40, 80), "blue").save(output, "PNG")
    return {"file": ("../../malicious.svg", output.getvalue(), "application/octet-stream")}


def test_clients_crud_filters_and_server_selected_creator(client):
    assert client.get("/clients").status_code == 401
    headers = login(client)
    assert client.get("/clients").json() == []
    assert client.post("/clients", headers=ORIGIN, json={"name": "Client", "niche": "Varejo"}).status_code == 403
    response = client.post("/clients", headers=headers,
                           json={"name": " Client ", "niche": "Varejo", "notes": "Initial", "contract_closed": False})
    assert response.status_code == 201
    row = response.json()
    assert row["name"] == "Client"
    assert row["created_by_id"] == client.get("/auth/me").json()["id"]
    assert response.headers["cache-control"] == "no-store"
    path = "/clients/" + row["id"]
    assert client.get(path).status_code == 200
    assert client.patch(path, headers=headers, json={"contract_closed": True, "notes": None}).status_code == 200
    assert client.get(path).json()["notes"] is None
    assert client.get("/clients", params={"contract_closed": False}).json() == []
    assert len(client.get("/clients", params={"niche": "Varejo", "contract_closed": True}).json()) == 1
    assert client.post("/clients", headers=headers, json={"name": "Forged", "niche": "Tech", "created_by_id": "other"}).status_code == 422
    assert client.patch(path, headers=headers, json={"name": None}).status_code == 422
    assert client.get("/clients", params={"limit": 101}).status_code == 422
    assert client.delete(path, headers=headers).status_code == 204
    assert client.get(path).status_code == 404
    assert client.get("/clients").json() == []


def test_sales_channel_is_optional_filterable_and_can_be_cleared(client):
    headers = login(client)
    plain = client.post("/clients", headers=headers, json={"name": "Sem canal", "niche": "Contabilidade"})
    assert plain.status_code == 201 and plain.json()["sales_channel"] is None
    by_email = client.post("/clients", headers=headers,
                           json={"name": "Por e-mail", "niche": "Contabilidade", "sales_channel": "email"})
    assert by_email.status_code == 201 and by_email.json()["sales_channel"] == "email"
    client.post("/clients", headers=headers, json={"name": "Por zap", "niche": "Varejo", "sales_channel": "whatsapp"})

    names = lambda **params: sorted(row["name"] for row in client.get("/clients", params=params).json())  # noqa: E731
    assert names() == ["Por e-mail", "Por zap", "Sem canal"]
    assert names(sales_channel="email") == ["Por e-mail"]
    assert names(sales_channel="email", niche="Varejo") == []
    assert names(sales_channel="instagram") == []
    assert client.get("/clients", params={"sales_channel": "telegram"}).status_code == 422

    path = "/clients/" + plain.json()["id"]
    assert client.patch(path, headers=headers, json={"sales_channel": "instagram"}).json()["sales_channel"] == "instagram"
    assert client.patch(path, headers=headers, json={"notes": "só nota"}).json()["sales_channel"] == "instagram"
    assert client.patch(path, headers=headers, json={"sales_channel": None}).json()["sales_channel"] is None
    assert client.get(path).json()["sales_channel"] is None
    assert client.patch(path, headers=headers, json={"sales_channel": "pombo-correio"}).status_code == 422
    assert client.post("/clients", headers=headers,
                       json={"name": "Inválido", "niche": "Varejo", "sales_channel": "pombo-correio"}).status_code == 422
    # The filtered list must not serve a stale cached answer after the change.
    assert names(sales_channel="email") == ["Por e-mail"] and names(sales_channel="instagram") == []


def test_api_key_client_creation_notifies_site_and_queues_email(client, monkeypatch):
    from unittest.mock import Mock

    session_headers = login(client)
    key_response = client.post("/auth/api-keys", headers=session_headers,
                               json={"name": "client notification test"})
    assert key_response.status_code == 201
    api_key = key_response.json()["key"]

    services = client.app.state.services
    email = Mock(return_value=True)
    push = Mock()
    monkeypatch.setattr(services.messages, "announcement", email)
    monkeypatch.setattr(services.push, "notify_users", push)

    response = client.post("/clients", headers={"Authorization": f"Bearer {api_key}"}, json={
        "name": "Lead criado via API", "niche": "Contabilidade",
    })
    assert response.status_code == 201
    created = response.json()

    notices = client.get("/notifications", headers=session_headers).json()
    notice = next(item for item in notices if item["title"] == "Novo cliente cadastrado")
    assert "Lead criado via API" in notice["body"]
    assert email.call_count == 1
    assert email.call_args.args[1] == "Novo cliente cadastrado"
    push.assert_called_once_with([created["created_by_id"]], "Novo cliente cadastrado",
                                 notice["body"])


def test_pending_cannot_read_or_mutate_clients_and_approval_activates_session(client):
    assert verified_register(client, headers=ORIGIN, json=DATA).status_code == 201
    headers = login(client, DATA["email"], DATA["password"])
    member_token = client.cookies.get("nexo_access_token")
    assert client.get("/clients").status_code == 403
    assert client.post("/clients", headers=headers, json={"name": "Client", "niche": "Tech"}).status_code == 403
    admin_headers = login(client)
    note = client.get("/admin/notifications").json()[0]
    assert client.post("/admin/notifications/" + note["id"] + "/decision", headers=admin_headers,
                       json={"decision": "approved"}).status_code == 200
    client.cookies.clear()
    client.cookies.set("nexo_access_token", member_token)
    assert client.get("/clients").status_code == 200
    assert client.post("/clients", headers=headers, json={"name": "Client", "niche": "Tech"}).status_code == 201


def test_profile_photo_is_private_validated_and_can_be_deleted(client):
    headers = login(client)
    assert client.get("/auth/profile/photo").status_code == 404
    assert client.put("/auth/profile/photo", headers=ORIGIN, files=photo()).status_code == 403
    response = client.put("/auth/profile/photo", headers=headers, files=photo())
    assert response.status_code == 200
    assert "/" not in response.json()["profile_photo"]
    picture = client.get("/auth/profile/photo")
    assert picture.status_code == 200 and picture.headers["content-type"] == "image/jpeg"
    assert picture.headers["x-content-type-options"] == "nosniff"
    assert picture.headers["cache-control"] == "no-store"
    assert client.put("/auth/profile/photo", headers=headers,
                      files={"file": ("fake.png", b"<svg><script>bad()</script></svg>", "image/png")}).status_code == 400
    client.app.state.settings.profile_photo_max_bytes = 10
    assert client.put("/auth/profile/photo", headers=headers, files=photo()).status_code == 413
    assert client.get("/auth/profile/photo").status_code == 200
    assert client.delete("/auth/profile/photo", headers=headers).status_code == 204
    assert client.get("/auth/me").json()["profile_photo"] is None
    assert client.get("/auth/profile/photo").status_code == 404
    client.cookies.clear()
    assert client.get("/auth/profile/photo").status_code == 401


def test_pending_can_edit_only_own_profile_without_promoting_account(client):
    assert verified_register(client, headers=ORIGIN, json=DATA).status_code == 201
    headers = login(client, DATA["email"], DATA["password"])
    assert client.put("/auth/profile", headers=headers,
                      json={"name": "Ana Silva", "phone": "11988888888"}).status_code == 200
    assert client.put("/auth/profile", headers=headers,
                      json={"name": "Ana", "phone": "11988888888", "status": "approved"}).status_code == 422
    assert client.put("/auth/profile/photo", headers=headers, files=photo()).status_code == 200
    assert client.get("/clients").status_code == 403
    client.cookies.clear()
    login(client)
    assert client.get("/auth/profile/photo").status_code == 404
