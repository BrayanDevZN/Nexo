"""Complete browser-cookie lifecycle using real SQLite/Redis and mocked SMTP."""
import re
from io import BytesIO
from unittest.mock import Mock

from fastapi.testclient import TestClient
from PIL import Image
from pydantic import SecretStr

from backend.controller.application import create_app
from backend.domain.passwords import PasswordHasher

ORIGIN = {"Origin": "https://panel.example.com"}
MEMBER = {"email": "member@example.com", "password": "initial-member-password",
          "name": "Ana", "phone": "11999999999"}
ADMIN = {"email": "owner@example.com", "password": "initial-admin-password"}


def csrf(client):
    response = client.get("/auth/csrf")
    assert response.status_code == 200
    return {**ORIGIN, "X-CSRF-Token": response.json()["csrf_token"]}


def login(client, credentials):
    client.cookies.clear()
    response = client.post("/auth/login", headers=ORIGIN, json=credentials)
    assert response.status_code == 200
    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie and "Secure" in cookie and "SameSite=none" in cookie
    assert "token" not in response.json()
    return csrf(client)


def test_complete_approved_member_lifecycle(settings, local_redis_url, tmp_path, monkeypatch):
    settings.environment = "production"
    settings.redis_url = SecretStr(local_redis_url)
    settings.cookie_secure = True
    settings.cookie_samesite = "none"
    settings.frontend_url = "https://panel.example.com"
    settings.cors_origins = ["https://panel.example.com"]
    settings.admin_email = ADMIN["email"]
    settings.admin_password = SecretStr(ADMIN["password"])
    settings.email = "sender@example.com"
    settings.password = SecretStr("mock-smtp-secret")
    settings.upload_dir = tmp_path / "photos"
    settings.auth_rate_limit = 30
    smtp = Mock()
    monkeypatch.setattr("backend.infra.connections.email.yagmail.SMTP", Mock(return_value=smtp))
    monkeypatch.setattr("backend.service.runtime.PasswordHasher", lambda: PasswordHasher(rounds=4))
    app = create_app(settings)
    with TestClient(app, base_url="https://api.example.com") as client:
        futures = []
        send = app.state.services.email.send

        def tracked_send(*args, **kwargs):
            future = send(*args, **kwargs)
            futures.append(future)
            return future

        app.state.services.email.send = tracked_send
        assert client.get("/docs").status_code == 404
        assert client.get("/openapi.json").status_code == 404
        assert client.get("/health/ready").status_code == 200
        assert client.post("/auth/register", headers=ORIGIN, json=MEMBER).status_code == 201
        member_headers = login(client, {key: MEMBER[key] for key in ("email", "password")})
        token = client.cookies.get(settings.auth_cookie_name)
        assert client.get("/auth/me").json()["status"] == "pending"
        assert client.get("/clients").status_code == 403
        assert client.get("/admin/users").status_code == 403

        admin_headers = login(client, ADMIN)
        notification = client.get("/admin/notifications", params={"unresolved_only": True}).json()[0]
        decision = "/admin/notifications/" + notification["id"] + "/decision"
        assert client.post(decision, headers=admin_headers, json={"decision": "approved"}).status_code == 200
        assert client.get("/admin/notifications", params={"unresolved_only": True}).json() == []

        client.cookies.clear()
        client.cookies.set(settings.auth_cookie_name, token)
        assert client.get("/auth/me").json()["status"] == "approved"
        assert client.get("/clients").json() == []
        response = client.post("/clients", headers=member_headers, json={"name": "Loja", "niche": "Varejo"})
        assert response.status_code == 201
        path = "/clients/" + response.json()["id"]
        assert client.get("/clients").json()[0]["contract_closed"] is False
        assert client.patch(path, headers=member_headers, json={"contract_closed": True}).status_code == 200
        assert client.get("/clients", params={"contract_closed": False}).json() == []
        assert client.get(path).json()["contract_closed"] is True
        assert client.put("/auth/profile", headers=member_headers,
                          json={"name": "Ana Silva", "phone": "11988888888"}).status_code == 200
        image = BytesIO()
        Image.new("RGB", (16, 16), "purple").save(image, "PNG")
        assert client.put("/auth/profile/photo", headers=member_headers,
                          files={"file": ("photo.png", image.getvalue(), "image/png")}).status_code == 200
        assert client.get("/auth/profile/photo").headers["content-type"] == "image/jpeg"
        assert client.delete("/auth/profile/photo", headers=member_headers).status_code == 204
        assert client.delete(path, headers=member_headers).status_code == 204
        assert client.get("/clients").json() == []

        changed = "changed-member-password"
        assert client.post("/auth/password/change", headers=member_headers,
                           json={"current_password": MEMBER["password"], "new_password": changed}).status_code == 204
        client.cookies.set(settings.auth_cookie_name, token)
        assert client.get("/auth/me").status_code == 401
        login(client, {"email": MEMBER["email"], "password": changed})
        changed_token = client.cookies.get(settings.auth_cookie_name)
        client.cookies.clear()
        assert client.post("/auth/password/recovery/request", headers=ORIGIN,
                           json={"email": MEMBER["email"]}).status_code == 202
        for future in futures:
            future.result(timeout=5)
        messages = [call.kwargs for call in smtp.send.call_args_list
                    if call.kwargs["subject"].startswith("Código")]
        assert len(messages) == 1
        code = re.search(r"[0-9]{8}", str(messages[0]["contents"])).group()
        recovered = "recovered-member-password"
        payload = {"email": MEMBER["email"], "code": code, "new_password": recovered}
        assert client.post("/auth/password/recovery/confirm", headers=ORIGIN, json=payload).status_code == 204
        assert client.post("/auth/password/recovery/confirm", headers=ORIGIN, json=payload).status_code == 400
        client.cookies.set(settings.auth_cookie_name, changed_token)
        assert client.get("/auth/me").status_code == 401
        headers = login(client, {"email": MEMBER["email"], "password": recovered})
        assert client.get("/auth/me").json()["name"] == "Ana Silva"
        assert client.get("/clients").status_code == 200
        assert client.post("/auth/logout", headers=headers).status_code == 204
        assert client.get("/auth/me").status_code == 401
