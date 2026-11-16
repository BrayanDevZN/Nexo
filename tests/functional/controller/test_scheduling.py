"""HTTP contract of /atendimentos: accounts, businesses, teams, services, appointments and the cache."""
from concurrent.futures import Future
from unittest.mock import AsyncMock, Mock, patch
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from backend.controller.application import create_app
from backend.domain.passwords import PasswordHasher

ORIGIN = {"Origin": "http://localhost:5173"}
ANA = {"name": "Ana", "phone": "11999999999", "email": "ana@example.com", "password": "strong-password-123"}
BIA = {"name": "Bia", "phone": "11988888888", "email": "bia@example.com", "password": "another-password-123"}
HOURS = {"mon": [["09:00", "12:00"], ["13:00", "18:00"]], "sat": [["09:00", "13:00"]]}


@pytest.fixture
def client(settings, local_redis_url, monkeypatch, google_signer):
    settings.redis_url = SecretStr(local_redis_url)
    settings.google_client_id = "test-google-client"
    settings.google_client_secret = SecretStr("test-google-secret")
    settings.auth_rate_limit = 100  # these scenarios sign three accounts in and out many times
    monkeypatch.setattr("backend.service.runtime.PasswordHasher", lambda: PasswordHasher(rounds=4))
    app = create_app(settings)
    with TestClient(app) as client:
        sign, keys = google_signer
        app.state.services.google.provider.exchange = AsyncMock(
            side_effect=lambda code, verifier, nonce: {"id_token": sign(nonce=nonce), "keys": keys})
        yield client


def register(client, data):
    service = client.app.state.services.booking_registration
    done = Future()
    done.set_result(None)
    with (patch.object(service, "sender", Mock(configured=True, send=Mock(return_value=done))),
          patch.object(service, "messages", None), patch.object(service.codes, "create", return_value="12345678")):
        response = client.post("/atendimentos/auth/register", json=data, headers=ORIGIN)
    if response.status_code != 202:
        return response
    return client.post("/atendimentos/auth/register/confirm", headers=ORIGIN,
                       json={"email": data["email"], "code": "12345678"})


def login(client, data):
    client.cookies.clear()
    assert client.post("/atendimentos/auth/login", headers=ORIGIN,
                       json={"email": data["email"], "password": data["password"]}).status_code == 200
    return {**ORIGIN, "X-CSRF-Token": client.get("/atendimentos/auth/csrf").json()["csrf_token"]}


def create_business(client, headers, name="Barbearia do Zé"):
    response = client.post("/atendimentos/businesses", headers=headers,
                           json={"name": name, "phone": "11977777777", "city": "São Paulo", "state": "sp",
                                 "opening_hours": HOURS})
    assert response.status_code == 201, response.text
    return response.json()


def test_account_lifecycle_and_session_isolation_from_the_panel(client):
    response = register(client, ANA)
    assert response.status_code == 201 and response.json()["email"] == "ana@example.com"
    assert "nexo_atendimentos_token" in response.headers["set-cookie"] and "HttpOnly" in response.headers["set-cookie"]
    assert client.get("/atendimentos/auth/me").json()["name"] == "Ana"
    assert client.get("/atendimentos/auth/me").headers["cache-control"] == "no-store"
    # The scheduling session is not a panel session, and the panel's users table did not get the account.
    assert client.get("/auth/me").status_code == 401
    with client.app.state.services.repositories.read_transaction() as repos:
        assert repos.users.by_email("ana@example.com") is None
        assert repos.booking_users.by_email("ana@example.com") is not None
    assert register(client, ANA).status_code == 409
    headers = login(client, ANA)
    assert client.put("/atendimentos/auth/profile", headers=ORIGIN, json={"name": "Ana S."}).status_code == 403
    assert client.put("/atendimentos/auth/profile", headers=headers, json={"name": "Ana S.", "phone": None}).json()["phone"] is None
    assert client.post("/atendimentos/auth/password/change", headers=headers,
                       json={"current_password": ANA["password"], "new_password": "brand-new-password-123"}).status_code == 204
    assert client.get("/atendimentos/auth/me").status_code == 401
    headers = login(client, {**ANA, "password": "brand-new-password-123"})
    assert client.post("/atendimentos/auth/logout", headers=headers).status_code == 204
    assert client.get("/atendimentos/auth/me").status_code == 401
    assert client.get("/atendimentos/businesses").status_code == 401


def test_businesses_cannot_be_duplicated_by_name_or_cnpj_and_cnpj_is_optional(client):
    register(client, ANA)
    register(client, BIA)
    ana = login(client, ANA)
    business = create_business(client, ana)
    assert business["cnpj"] is None
    url = "/atendimentos/businesses"
    # Same name, however it is typed, and even from another account.
    for name in ("barbearia do ze", "  BARBEARIA   DO ZÉ! "):
        response = client.post(url, headers=ana, json={"name": name})
        assert response.status_code == 409 and "nome" in response.json()["detail"]
    bia = login(client, BIA)
    assert client.post(url, headers=bia, json={"name": "Barbearia do Zé"}).status_code == 409
    # CNPJ: validated, stored as digits, unique.
    assert client.post(url, headers=bia, json={"name": "Salão A", "cnpj": "11.222.333/0001-80"}).status_code == 422
    created = client.post(url, headers=bia, json={"name": "Salão A", "cnpj": "11.222.333/0001-81"})
    assert created.status_code == 201 and created.json()["cnpj"] == "11222333000181"
    ana = login(client, ANA)
    assert client.post(url, headers=ana, json={"name": "Salão B", "cnpj": "11222333000181"}).status_code == 409
    bia = login(client, BIA)
    assert client.post(url, headers=bia, json={"name": "Salão C", "cnpj": ""}).json()["cnpj"] is None
    # Editing: keeping its own name is fine, taking another business's is not.
    path = url + "/" + created.json()["id"]
    assert client.patch(path, headers=bia, json={"name": "SALÃO A", "city": "Rio"}).status_code == 200
    assert client.patch(path, headers=bia, json={"name": "Salão C"}).status_code == 409
    assert client.patch(path, headers=bia, json={"cnpj": None}).json()["cnpj"] is None


def test_business_services_and_appointments_with_cache_invalidation(client):
    register(client, ANA)
    headers = login(client, ANA)
    assert client.get("/atendimentos/businesses").json() == []
    business = create_business(client, headers)
    assert business["my_role"] == "owner" and business["slug"] == "barbearia-do-ze" and business["state"] == "SP"
    assert business["opening_hours"]["mon"] == HOURS["mon"] and business["opening_hours"]["tue"] == []
    other = create_business(client, headers, "Barbearia do Zé Centro")
    assert other["id"] != business["id"]
    # The list was cached before the second business; the commit must have refreshed it.
    assert [row["id"] for row in client.get("/atendimentos/businesses").json()] == [business["id"], other["id"]]
    path = "/atendimentos/businesses/" + business["id"]
    assert client.patch(path, headers=headers, json={"opening_hours": {"mon": [["10:00", "09:00"]]}}).status_code == 422
    assert client.patch(path, headers=headers, json={"timezone": "Marte/Olympus"}).status_code == 422
    assert client.patch(path, headers=headers, json={"description": "Cortes clássicos"}).json()["description"] == "Cortes clássicos"
    assert client.get(path).json()["description"] == "Cortes clássicos"

    services = path + "/services"
    assert client.post(services, headers=headers, json={"name": "Corte", "duration_minutes": 3}).status_code == 422
    corte = client.post(services, headers=headers, json={"name": " Corte ", "duration_minutes": 30, "price": "45.00"}).json()
    assert corte["name"] == "Corte" and corte["price"] == 45.0 and corte["active"] is True
    barba = client.post(services, headers=headers, json={"name": "Barba", "duration_minutes": 20}).json()
    assert [row["name"] for row in client.get(services).json()] == ["Corte", "Barba"]
    assert client.patch(services + "/" + barba["id"], headers=headers, json={"active": False}).json()["active"] is False
    assert [row["name"] for row in client.get(services, params={"active": True}).json()] == ["Corte"]

    appointments = path + "/appointments"
    assert client.post(appointments, headers=headers, json={"customer_name": "João", "starts_at": "2026-12-01T13:00:00Z"}).status_code == 422
    assert client.post(appointments, headers=headers, json={"customer_name": "João", "service_id": barba["id"],
                                                             "starts_at": "2026-12-01T13:00:00Z"}).status_code == 404
    me = client.get("/atendimentos/auth/me").json()
    created = client.post(appointments, headers=headers, json={
        "customer_name": "João", "customer_phone": "11966666666", "service_id": corte["id"],
        "staff_user_id": me["id"], "starts_at": "2026-12-01T13:00:00-03:00"})
    assert created.status_code == 201, created.text
    first = created.json()
    # Period derived from the service, times stored in UTC, price copied from the service, staff name resolved.
    assert first["starts_at"].startswith("2026-12-01T16:00:00") and first["ends_at"].startswith("2026-12-01T16:30:00")
    assert first["service_name"] == "Corte" and first["price"] == 45.0 and first["staff_name"] == "Ana"
    assert first["status"] == "scheduled" and first["created_by_id"] == me["id"]
    conflict = client.post(appointments, headers=headers, json={
        "customer_name": "Pedro", "service_id": corte["id"], "staff_user_id": me["id"], "starts_at": "2026-12-01T16:15:00Z"})
    assert conflict.status_code == 409
    free = client.post(appointments, headers=headers, json={
        "customer_name": "Pedro", "service_name": "Pacote", "starts_at": "2026-12-01T16:15:00Z",
        "ends_at": "2026-12-01T17:00:00Z"})
    assert free.status_code == 201 and free.json()["staff_user_id"] is None and free.json()["price"] is None
    listed = client.get(appointments, params={"starts_from": "2026-12-01T00:00:00Z", "starts_until": "2026-12-02T00:00:00Z"}).json()
    assert [row["customer_name"] for row in listed] == ["João", "Pedro"]
    assert client.get(appointments, params={"staff_user_id": me["id"]}).json()[0]["id"] == first["id"]
    assert client.get(appointments, params={"customer": "ped"}).json()[0]["id"] == free.json()["id"]
    assert client.get(appointments, params={"status": "done"}).json() == []
    one = appointments + "/" + first["id"]
    assert client.patch(one, headers=headers, json={"status": "done"}).json()["status"] == "done"
    assert [row["id"] for row in client.get(appointments, params={"status": "done"}).json()] == [first["id"]]
    # Once João is done, Pedro can take the professional's slot; moving him back onto an active one is refused.
    moved = client.patch(appointments + "/" + free.json()["id"], headers=headers, json={"staff_user_id": me["id"]})
    assert moved.status_code == 200 and moved.json()["staff_name"] == "Ana"
    assert client.patch(one, headers=headers, json={"status": "confirmed"}).status_code == 409
    assert client.patch(one, headers=headers, json={"starts_at": "2026-12-01T18:00:00Z"}).status_code == 200
    reopened = client.patch(one, headers=headers, json={"status": "confirmed"})
    assert reopened.status_code == 200 and reopened.json()["ends_at"].startswith("2026-12-01T18:30:00")
    overview = client.get(path + "/overview").json()
    assert overview["by_status"] == {"scheduled": 1, "confirmed": 1, "done": 0, "cancelled": 0, "no_show": 0}
    assert overview["upcoming"] == 2 and [row["customer_name"] for row in overview["next"]] == ["Pedro", "João"]
    # Deleting the service keeps the history readable and refreshes the appointment cache.
    assert client.delete(services + "/" + corte["id"], headers=headers).status_code == 204
    assert client.get(one).json()["service_id"] is None and client.get(one).json()["service_name"] == "Corte"
    assert client.delete(one, headers=headers).status_code == 204
    assert client.get(one).status_code == 404
    assert client.delete(path, headers=headers).status_code == 204
    assert client.get(path).status_code == 404
    assert [row["id"] for row in client.get("/atendimentos/businesses").json()] == [other["id"]]


def test_invitations_roles_and_permissions(client):
    register(client, ANA)
    register(client, BIA)
    owner = login(client, ANA)
    business = create_business(client, owner)
    path = "/atendimentos/businesses/" + business["id"]
    corte = client.post(path + "/services", headers=owner, json={"name": "Corte", "duration_minutes": 30}).json()
    invitations = path + "/invitations"
    assert client.post(invitations, headers=owner, json={"role": "owner"}).status_code == 422
    sent = Mock(return_value=True)
    with patch.object(client.app.state.services.messages, "booking_invitation", sent):
        invite = client.post(invitations, headers=owner, json={"role": "viewer", "email": "bia@example.com"})
    assert invite.status_code == 201 and invite.json()["url"].startswith("http://localhost:5173/atendimentos?invite=")
    assert sent.call_args.args[0] == "bia@example.com" and sent.call_args.kwargs["role_label"] == "leitura"
    token = parse_qs(urlsplit(invite.json()["url"]).query)["invite"][0]
    assert [row["id"] for row in client.get(invitations).json()] == [invite.json()["id"]]
    assert "url" not in client.get(invitations).json()[0] or client.get(invitations).json()[0]["url"] is None
    client.cookies.clear()
    info = client.get("/atendimentos/invitations/" + token)
    assert info.status_code == 200 and info.json()["business_name"] == "Barbearia do Zé" and info.json()["role"] == "viewer"
    assert client.get("/atendimentos/invitations/" + "x" * 43).status_code == 404
    assert client.post("/atendimentos/invitations/" + token + "/accept", headers=ORIGIN).status_code == 401

    # A third account with another e-mail cannot use Bia's invitation.
    register(client, {**ANA, "email": "carla@example.com", "name": "Carla"})
    carla = login(client, {**ANA, "email": "carla@example.com"})
    assert client.post("/atendimentos/invitations/" + token + "/accept", headers=carla).status_code == 403
    assert client.get(path).status_code == 404

    viewer = login(client, BIA)
    accepted = client.post("/atendimentos/invitations/" + token + "/accept", headers=viewer)
    assert accepted.status_code == 200 and accepted.json()["my_role"] == "viewer"
    assert client.post("/atendimentos/invitations/" + token + "/accept", headers=viewer).status_code == 404
    assert client.get("/atendimentos/businesses").json()[0]["my_role"] == "viewer"
    assert client.get(path + "/services").json()[0]["id"] == corte["id"]
    assert client.get(path + "/invitations").status_code == 403
    assert client.post(path + "/services", headers=viewer, json={"name": "Barba", "duration_minutes": 20}).status_code == 403
    assert client.post(path + "/appointments", headers=viewer, json={
        "customer_name": "João", "service_id": corte["id"], "starts_at": "2026-12-01T13:00:00Z"}).status_code == 403
    assert client.patch(path, headers=viewer, json={"name": "Outra"}).status_code == 403
    assert client.delete(path, headers=viewer).status_code == 403
    bia_id = client.get("/atendimentos/auth/me").json()["id"]

    owner = login(client, ANA)
    members = client.get(path + "/members").json()
    assert [(row["name"], row["role"]) for row in members] == [("Ana", "owner"), ("Bia", "viewer")]
    assert client.patch(path + "/members/" + bia_id, headers=owner, json={"role": "staff"}).json()["role"] == "staff"
    assert client.get(path + "/members").json()[1]["role"] == "staff"
    ana_id = client.get("/atendimentos/auth/me").json()["id"]
    assert client.patch(path + "/members/" + ana_id, headers=owner, json={"role": "staff"}).status_code == 403
    assert client.delete(path + "/members/" + ana_id, headers=owner).status_code == 403

    staff = login(client, BIA)
    booked = client.post(path + "/appointments", headers=staff, json={
        "customer_name": "João", "service_id": corte["id"], "staff_user_id": bia_id, "starts_at": "2026-12-01T13:00:00Z"})
    assert booked.status_code == 201 and booked.json()["staff_name"] == "Bia"
    assert client.delete(path + "/appointments/" + booked.json()["id"], headers=staff).status_code == 403
    assert client.post(path + "/invitations", headers=staff, json={"role": "viewer"}).status_code == 403
    # Leaving the team is always allowed; the owner is protected.
    assert client.delete(path + "/members/" + bia_id, headers=staff).status_code == 204
    assert client.get(path).status_code == 404
    assert client.get("/atendimentos/businesses").json() == []

    owner = login(client, ANA)
    assert len(client.get(path + "/members").json()) == 1
    assert client.get(path + "/appointments").json()[0]["staff_name"] == "Bia"
    manager_link = client.post(path + "/invitations", headers=owner, json={"role": "manager"}).json()
    assert client.delete(path + "/invitations/" + manager_link["id"], headers=owner).status_code == 204
    assert client.get(path + "/invitations").json() == []
    assert client.get("/atendimentos/invitations/" + parse_qs(urlsplit(manager_link["url"]).query)["invite"][0]).status_code == 404


def photo():
    from io import BytesIO

    from PIL import Image
    output = BytesIO()
    Image.new("RGB", (40, 80), "blue").save(output, "PNG")
    return {"file": ("foto.png", output.getvalue(), "image/png")}


def test_user_and_business_photos_are_optional_private_and_normalized(client):
    register(client, ANA)
    register(client, BIA)
    owner = login(client, ANA)
    assert client.get("/atendimentos/auth/me").json()["has_photo"] is False
    assert client.get("/atendimentos/auth/profile/photo").status_code == 404
    assert client.put("/atendimentos/auth/profile/photo", headers=ORIGIN, files=photo()).status_code == 403
    assert client.put("/atendimentos/auth/profile/photo", headers=owner,
                      files={"file": ("x.png", b"<svg/>", "image/png")}).status_code == 400
    assert client.put("/atendimentos/auth/profile/photo", headers=owner, files=photo()).json()["has_photo"] is True
    picture = client.get("/atendimentos/auth/profile/photo")
    assert picture.status_code == 200 and picture.headers["content-type"] == "image/jpeg"
    assert client.get("/atendimentos/auth/me").json()["has_photo"] is True
    ana_id = client.get("/atendimentos/auth/me").json()["id"]
    business = create_business(client, owner)
    path = "/atendimentos/businesses/" + business["id"]
    assert business["has_photo"] is False and client.get(path + "/photo").status_code == 404
    assert client.put(path + "/photo", headers=owner, files=photo()).json()["has_photo"] is True
    assert client.get(path + "/photo").headers["content-type"] == "image/jpeg"
    assert client.get("/atendimentos/businesses").json()[0]["has_photo"] is True
    invite = client.post(path + "/invitations", headers=owner, json={"role": "viewer"}).json()
    token = parse_qs(urlsplit(invite["url"]).query)["invite"][0]
    # Bia is not a teammate yet: Ana's photo and the business photo stay private.
    viewer = login(client, BIA)
    assert client.get("/atendimentos/auth/profile/photo", params={"user_id": ana_id}).status_code == 404
    assert client.get(path + "/photo").status_code == 401 or client.get(path + "/photo").status_code == 404
    assert client.post("/atendimentos/invitations/" + token + "/accept", headers=viewer).status_code == 200
    assert client.get("/atendimentos/auth/profile/photo", params={"user_id": ana_id}).status_code == 200
    assert client.get(path + "/photo").status_code == 200
    assert client.get(path + "/members").json()[0]["has_photo"] is True
    assert client.put(path + "/photo", headers=viewer, files=photo()).status_code == 403
    owner = login(client, ANA)
    assert client.delete(path + "/photo", headers=owner).json()["has_photo"] is False
    assert client.delete("/atendimentos/auth/profile/photo", headers=owner).status_code == 204
    assert client.get("/atendimentos/auth/me").json()["has_photo"] is False


def start_google(client):
    response = client.get("/atendimentos/auth/google/login", follow_redirects=False)
    assert response.status_code == 302 and "nexo_google_flow" in response.headers["set-cookie"]
    return parse_qs(urlsplit(response.headers["location"]).query)["state"][0]


def finish_google(client, state):
    return client.get("/auth/google/callback", params={"state": state, "code": "test-code"}, follow_redirects=False)


def test_google_sign_in_lands_on_atendimentos_with_its_own_accounts(client):
    response = finish_google(client, start_google(client))
    assert response.status_code == 302 and response.headers["location"].endswith("/atendimentos/completar-perfil")
    assert "nexo_atendimentos_google_profile=" in response.headers["set-cookie"]
    assert client.get("/atendimentos/auth/me").status_code == 401 and client.get("/auth/google/profile").status_code == 401
    profile = client.get("/atendimentos/auth/google/profile")
    assert profile.status_code == 200 and profile.json()["email"] == "ana@example.com"
    headers = {**ORIGIN, "X-CSRF-Token": profile.json()["csrf_token"]}
    assert client.post("/atendimentos/auth/google/complete", json={"name": "Ana"}, headers=ORIGIN).status_code == 401
    created = client.post("/atendimentos/auth/google/complete", json={"name": "Ana G.", "phone": "11999999999"}, headers=headers)
    assert created.status_code == 201 and created.json()["phone"] == "+11999999999"
    assert client.get("/atendimentos/auth/me").json()["name"] == "Ana G."
    assert client.get("/auth/me").status_code == 401
    with client.app.state.services.repositories.read_transaction() as repos:
        assert repos.users.by_email("ana@example.com") is None
        assert repos.booking_users.by_email("ana@example.com").google_sub == "google-user-123"
    client.cookies.clear()
    again = finish_google(client, start_google(client))
    assert again.status_code == 302 and again.headers["location"].endswith("/atendimentos")
    assert "nexo_atendimentos_token=" in again.headers["set-cookie"]
    assert client.get("/atendimentos/auth/me").json()["name"] == "Ana G."
    # The panel's own Google flow still lands on the panel, untouched.
    client.cookies.clear()
    panel = client.get("/auth/google/login", follow_redirects=False)
    state = parse_qs(urlsplit(panel.headers["location"]).query)["state"][0]
    response = finish_google(client, state)
    assert response.headers["location"].endswith("/admin/complete-profile")


def test_google_links_to_a_local_atendimentos_account_by_verified_email(client):
    register(client, ANA)
    client.cookies.clear()
    response = finish_google(client, start_google(client))
    assert response.status_code == 302 and response.headers["location"].endswith("/atendimentos")
    assert client.get("/atendimentos/auth/me").json()["name"] == "Ana"
    with client.app.state.services.repositories.read_transaction() as repos:
        user = repos.booking_users.by_email("ana@example.com")
        assert user.google_sub == "google-user-123" and user.password_hash is not None


def test_scheduling_api_keys_act_as_the_account_without_a_browser_session(client):
    register(client, ANA)
    headers = login(client, ANA)
    created = client.post("/atendimentos/auth/api-keys", headers=headers, json={"name": "n8n"})
    assert created.status_code == 201
    key = created.json()["key"]
    assert key.startswith("nexo_book_") and created.json()["key_prefix"] == key[:18] and "key_hash" not in created.json()
    assert [row["name"] for row in client.get("/atendimentos/auth/api-keys").json()] == ["n8n"]
    assert "key" not in client.get("/atendimentos/auth/api-keys").json()[0]

    client.cookies.clear()
    bearer = {"Authorization": "Bearer " + key}
    # A key reads and writes the resource routes with no cookie, Origin or CSRF token.
    assert client.get("/atendimentos/businesses", headers=bearer).json() == []
    made = client.post("/atendimentos/businesses", headers=bearer, json={"name": "Via chave"})
    assert made.status_code == 201 and made.json()["my_role"] == "owner"
    assert [row["name"] for row in client.get("/atendimentos/businesses", headers=bearer).json()] == ["Via chave"]
    # ...but not the account routes: keys cannot mint keys, read the profile or change the password.
    assert client.get("/atendimentos/auth/api-keys", headers=bearer).status_code == 401
    assert client.post("/atendimentos/auth/api-keys", headers=bearer, json={"name": "x"}).status_code in {401, 403}
    assert client.get("/atendimentos/auth/me", headers=bearer).status_code == 401
    # A wrong key, a panel-style key and no key at all are all refused; a bad key never falls back to a cookie.
    assert client.get("/atendimentos/businesses", headers={"Authorization": "Bearer nexo_book_wrong"}).status_code == 401
    assert client.get("/atendimentos/businesses", headers={"Authorization": "Bearer nexo_live_abc"}).status_code == 401
    assert client.get("/atendimentos/businesses").status_code == 401
    # Another account never sees this account's business through its own key.
    register(client, BIA)
    other = login(client, BIA)
    other_key = client.post("/atendimentos/auth/api-keys", headers=other, json={"name": "bia"}).json()["key"]
    client.cookies.clear()
    assert client.get("/atendimentos/businesses", headers={"Authorization": "Bearer " + other_key}).json() == []
    # Revoking stops the key at once.
    login(client, ANA)
    key_id = client.get("/atendimentos/auth/api-keys").json()[0]["id"]
    headers = {**ORIGIN, "X-CSRF-Token": client.get("/atendimentos/auth/csrf").json()["csrf_token"]}
    assert client.delete("/atendimentos/auth/api-keys/" + key_id, headers=headers).status_code == 204
    client.cookies.clear()
    assert client.get("/atendimentos/businesses", headers=bearer).status_code == 401


def test_appointments_can_be_searched_by_calendar_period_in_the_business_time_zone(client):
    register(client, ANA)
    headers = login(client, ANA)
    business = create_business(client, headers)
    path = "/atendimentos/businesses/" + business["id"]
    # São Paulo is UTC-3: 23:30 on Nov 16 there is 02:30 UTC on Nov 17, still the 16th for the business.
    for name, start in (("Cedo", "2026-11-16T12:00:00Z"), ("Noite", "2026-11-17T02:30:00Z"), ("Terça", "2026-11-17T13:00:00Z"),
                        ("Domingo", "2026-11-22T13:00:00Z"), ("Segunda", "2026-11-23T13:00:00Z"), ("Dezembro", "2026-12-02T13:00:00Z")):
        response = client.post(path + "/appointments", headers=headers,
                               json={"customer_name": name, "service_name": "Corte", "starts_at": start, "ends_at": start.replace(":00Z", ":30Z") if name != "Noite" else "2026-11-17T03:00:00Z"})
        assert response.status_code == 201, response.text

    def names(**params):
        response = client.get(path + "/appointments", params={"limit": 100, **params})
        assert response.status_code == 200, response.text
        return [row["customer_name"] for row in response.json()]

    assert names(period="day", date="2026-11-16") == ["Cedo", "Noite"]
    assert names(period="day", date="2026-11-17") == ["Terça"]
    # 2026-11-18 is a Wednesday. Weeks starting on Sunday run 15..21, on Monday 16..22 (the Sunday the 22nd).
    assert names(period="week", date="2026-11-18") == ["Cedo", "Noite", "Terça"]
    assert names(period="week", date="2026-11-18", week_starts="monday") == ["Cedo", "Noite", "Terça", "Domingo"]
    assert names(period="week", date="2026-11-23") == ["Domingo", "Segunda"]
    assert names(period="week", date="2026-11-23", week_starts="monday") == ["Segunda"]
    assert names(period="month", date="2026-11-30") == ["Cedo", "Noite", "Terça", "Domingo", "Segunda"]
    assert names(period="month", date="2026-12-15") == ["Dezembro"]
    # Combining a period with an explicit range, or a date with a period that has no anchor, is refused.
    assert client.get(path + "/appointments", params={"period": "day", "starts_from": "2026-11-16T00:00:00Z"}).status_code == 422
    assert client.get(path + "/appointments", params={"period": "today", "date": "2026-11-16"}).status_code == 422
    assert client.get(path + "/appointments", params={"period": "fortnight"}).status_code == 422
    # The relative periods answer too (they depend on today's date, so only the shape is checked).
    for period in ("today", "tomorrow", "next_7_days", "next_30_days", "upcoming"):
        assert isinstance(names(period=period), list)
