"""HTTP contract of /atendimentos: accounts, businesses, teams, services, appointments and the cache."""
from concurrent.futures import Future
from datetime import datetime
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
PANEL_PASSWORD = "another-strong-password"
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
        # Booking needs a professional. Scenarios that are not about that book with the signed-in person unless they
        # name one (or pass None, which is what the tests of the rule do).
        original_post = client.post

        def post(url, *args, **kwargs):
            body = kwargs.get("json")
            if str(url).endswith("/appointments") and isinstance(body, dict) and "staff_user_id" not in body \
                    and not kwargs.get("headers", {}).get("Authorization"):
                me = client.get("/atendimentos/auth/me")
                if me.status_code == 200:
                    kwargs["json"] = {**body, "staff_user_id": me.json()["id"]}
            return original_post(url, *args, **kwargs)
        client.post = post
        yield client


def approve(client, email, **kwargs):
    """What the Nexo team's approval does, for the scenarios that are about something else."""
    with client.app.state.services.repositories.transaction() as repos:
        repos.booking_users.set_access(repos.booking_users.by_email(email), status=kwargs.get("status", "approved"),
                                       expires_at=kwargs.get("expires_at"), source="approval")


def register(client, data, approved=True, access_token=None):
    response = sign_up(client, data, access_token)
    if approved and response.status_code == 201:
        approve(client, data["email"])
    return response


def sign_up(client, data, access_token=None):
    service = client.app.state.services.booking_registration
    done = Future()
    done.set_result(None)
    with (patch.object(service, "sender", Mock(configured=True, send=Mock(return_value=done))),
          patch.object(service, "messages", None), patch.object(service.codes, "create", return_value="12345678")):
        response = client.post("/atendimentos/auth/register", json=data, headers=ORIGIN)
    if response.status_code != 202:
        return response
    return client.post("/atendimentos/auth/register/confirm", headers=ORIGIN,
                       json={"email": data["email"], "code": "12345678", **({"access_token": access_token} if access_token else {})})


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


def test_an_account_can_be_deleted_and_takes_its_own_businesses_along(client):
    ana = {**ANA}
    assert register(client, ana).status_code == 201
    headers = login(client, ana)
    created = create_business(client, headers)
    assert client.delete("/atendimentos/auth/account", headers=ORIGIN).status_code == 403
    assert client.delete("/atendimentos/auth/account", headers=headers).status_code == 204
    assert client.get("/atendimentos/auth/me").status_code == 401
    with client.app.state.services.repositories.read_transaction() as repos:
        assert repos.booking_users.by_email(ana["email"]) is None
        assert repos.businesses.get(created["id"]) is None


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
    # Only the customer's name is required: a plain "Atendimento" of 30 minutes, with no price.
    plain = client.post(appointments, headers=headers, json={"customer_name": "João", "starts_at": "2026-12-01T13:00:00Z"})
    assert plain.status_code == 201 and plain.json()["service_name"] == "Atendimento" and plain.json()["price"] is None
    assert plain.json()["service_ids"] == [] and plain.json()["ends_at"].startswith("2026-12-01T13:30:00")
    assert client.delete(appointments + "/" + plain.json()["id"], headers=headers).status_code == 204
    assert client.post(appointments, headers=headers, json={"starts_at": "2026-12-01T13:00:00Z"}).status_code == 422
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
    pacote = {"customer_name": "Pedro", "service_name": "Pacote", "starts_at": "2026-12-01T16:15:00Z", "ends_at": "2026-12-01T17:00:00Z"}
    # The same professional cannot have two active appointments at once, even for a plain "Atendimento" with no service.
    assert client.post(appointments, headers=headers, json={**pacote, "staff_user_id": me["id"]}).status_code == 409
    # Back to back is fine, and the professional is required.
    assert client.post(appointments, headers=headers, json={**pacote, "staff_user_id": None}).status_code == 422
    one = appointments + "/" + first["id"]
    assert client.get(appointments, params={"status": "done"}).json() == []
    assert client.patch(one, headers=headers, json={"status": "done"}).json()["status"] == "done"
    assert [row["id"] for row in client.get(appointments, params={"status": "done"}).json()] == [first["id"]]
    # Once João is done, Pedro can take the professional's slot; bringing João back onto an active one is refused.
    free = client.post(appointments, headers=headers, json={**pacote, "staff_user_id": me["id"]})
    assert free.status_code == 201 and free.json()["staff_name"] == "Ana" and free.json()["price"] is None
    listed = client.get(appointments, params={"starts_from": "2026-12-01T00:00:00Z", "starts_until": "2026-12-02T00:00:00Z"}).json()
    assert [row["customer_name"] for row in listed] == ["João", "Pedro"]
    assert client.get(appointments, params={"staff_user_id": me["id"]}).json()[0]["id"] == first["id"]
    assert client.get(appointments, params={"customer": "ped"}).json()[0]["id"] == free.json()["id"]
    # An appointment cannot lose its professional either.
    assert client.patch(appointments + "/" + free.json()["id"], headers=headers, json={"staff_user_id": None}).status_code == 422
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


def test_the_same_professional_cannot_double_book_but_two_different_ones_can(client):
    register(client, ANA)
    register(client, BIA)
    owner = login(client, ANA)
    business = create_business(client, owner)
    path = "/atendimentos/businesses/" + business["id"]
    appointments = path + "/appointments"
    ana_id = client.get("/atendimentos/auth/me").json()["id"]
    invite = client.post(path + "/invitations", headers=owner, json={"role": "staff"}).json()
    token = parse_qs(urlsplit(invite["url"]).query)["invite"][0]
    bia = login(client, BIA)
    assert client.post("/atendimentos/invitations/" + token + "/accept", headers=bia).status_code == 200
    bia_id = client.get("/atendimentos/auth/me").json()["id"]
    owner = login(client, ANA)
    slot = {"customer_name": "João", "starts_at": "2026-12-01T13:00:00Z", "ends_at": "2026-12-01T14:00:00Z"}
    # The professional is required to book.
    assert client.post(appointments, headers=owner, json={**slot, "staff_user_id": None}).status_code == 422
    assert client.post(appointments, headers=owner, json={**slot, "staff_user_id": ana_id}).status_code == 201
    # The same professional at the same time (even partly) is refused; back to back is fine.
    overlap = client.post(appointments, headers=owner, json={**slot, "customer_name": "Pedro", "starts_at": "2026-12-01T13:30:00Z",
                                                              "ends_at": "2026-12-01T14:30:00Z", "staff_user_id": ana_id})
    assert overlap.status_code == 409
    assert client.post(appointments, headers=owner, json={**slot, "customer_name": "Pedro", "starts_at": "2026-12-01T14:00:00Z",
                                                          "ends_at": "2026-12-01T15:00:00Z", "staff_user_id": ana_id}).status_code == 201
    # Another professional can take the very same time.
    other = client.post(appointments, headers=owner, json={**slot, "customer_name": "Caio", "staff_user_id": bia_id})
    assert other.status_code == 201 and other.json()["staff_name"] == "Bia"
    # Moving it onto the busy professional is refused, and an appointment never loses its professional.
    assert client.patch(appointments + "/" + other.json()["id"], headers=owner, json={"staff_user_id": ana_id}).status_code == 409
    assert client.patch(appointments + "/" + other.json()["id"], headers=owner, json={"staff_user_id": None}).status_code == 422


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
    assert invite.json()["email_sent"] is True
    # By link: no e-mail, nothing is sent, and the URL is what the inviter shares.
    unsent = Mock(return_value=True)
    with patch.object(client.app.state.services.messages, "booking_invitation", unsent):
        by_link = client.post(invitations, headers=owner, json={"role": "staff"})
    assert by_link.status_code == 201 and by_link.json()["email"] is None and by_link.json()["email_sent"] is False
    assert by_link.json()["url"].startswith("http://localhost:5173/atendimentos?invite=") and not unsent.called
    # An e-mail that could not be queued is reported, with the link still there as a backup.
    with patch.object(client.app.state.services.messages, "booking_invitation", Mock(return_value=False)):
        failed = client.post(invitations, headers=owner, json={"role": "viewer", "email": "caio@example.com"})
    assert failed.json()["email_sent"] is False and failed.json()["url"]
    for extra in (by_link.json()["id"], failed.json()["id"]):
        assert client.delete(invitations + "/" + extra, headers=owner).status_code == 204
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


def test_the_nexo_team_api_key_manages_every_business_without_any_atendimentos_account(client):
    register(client, ANA)
    register(client, BIA)
    mine = create_business(client, login(client, ANA), "Barbearia da Ana")
    theirs = create_business(client, login(client, BIA), "Salão da Bia")
    services = client.app.state.services
    roles = (("Dono", "dono@empresa.com", "owner"), ("Admin", "admin@empresa.com", "admin"), ("Dev", "dev@empresa.com", "dev"), ("Comercial", "comercial@empresa.com", "commercial"))
    with services.repositories.transaction() as repos:
        for name, email, role in roles:
            repos.users.create(name=name, email=email, status="approved", role=role, password_hash=services.passwords.hash(PANEL_PASSWORD))

    def key(email):
        client.cookies.clear()
        assert client.post("/auth/login", headers=ORIGIN, json={"email": email, "password": PANEL_PASSWORD}).status_code == 200
        csrf = {**ORIGIN, "X-CSRF-Token": client.get("/auth/csrf").json()["csrf_token"]}
        secret = client.post("/auth/api-keys", headers=csrf, json={"name": "n8n"}).json()["key"]
        client.cookies.clear()
        return {"Authorization": "Bearer " + secret}

    for email in ("dono@empresa.com", "admin@empresa.com", "dev@empresa.com"):
        bearer = key(email)   # no Atendimentos account for any of them, and nothing was connected
        listed = client.get("/atendimentos/businesses", headers=bearer)
        assert listed.status_code == 200, listed.text
        assert {row["name"] for row in listed.json()} == {"Barbearia da Ana", "Salão da Bia"}
        assert {row["my_role"] for row in listed.json()} == {"owner"}
        path = "/atendimentos/businesses/" + theirs["id"]
        assert client.get(path, headers=bearer).json()["name"] == "Salão da Bia"
        assert client.get(path + "/members", headers=bearer).status_code == 200
        assert client.get(path + "/overview", headers=bearer).status_code == 200
        service = client.post(path + "/services", headers=bearer, json={"name": "Corte", "duration_minutes": 30}).json()
        team = client.get(path + "/members", headers=bearer).json()
        booked = client.post(path + "/appointments", headers=bearer, json={"customer_name": "João", "service_id": service["id"], "staff_user_id": team[0]["user_id"], "starts_at": "2026-11-16T12:00:00Z"})
        assert booked.status_code == 201, booked.text
        assert booked.json()["created_by_id"] is None
        assert client.patch(path + "/appointments/" + booked.json()["id"], headers=bearer, json={"status": "confirmed"}).json()["status"] == "confirmed"
        assert client.get(path + "/appointments", headers=bearer, params={"period": "day", "date": "2026-11-16"}).json()[0]["customer_name"] == "João"
        assert client.get("/atendimentos/businesses/00000000-0000-4000-8000-000000000000", headers=bearer).status_code == 404
        # What belongs to a person still needs an account: no business owned by a key, no invitations from or to one.
        assert client.post("/atendimentos/businesses", headers=bearer, json={"name": "Via chave"}).status_code == 403
        assert client.post(path + "/invitations", headers=bearer, json={"role": "staff"}).status_code == 403
        assert client.post("/atendimentos/invitations/nope/accept", headers=bearer).status_code == 403
        assert client.delete(path + "/appointments/" + booked.json()["id"], headers=bearer).status_code == 204
        # The account routes are the app's own: a key never reaches them.
        assert client.get("/atendimentos/auth/me", headers=bearer).status_code == 401
    with services.repositories.read_transaction() as repos:
        assert repos.booking_users.by_email("dono@empresa.com") is None and repos.booking_users.by_email("dev@empresa.com") is None
    # A commercial key reaches only clients and videos; a wrong key and no credentials are refused.
    assert client.get("/atendimentos/businesses", headers=key("comercial@empresa.com")).status_code == 403
    assert client.get("/atendimentos/businesses", headers={"Authorization": "Bearer nexo_live_wrong"}).status_code == 401
    assert client.get("/atendimentos/businesses").status_code == 401
    # New businesses show up in the key's list at once, and the app's own users still only see their own.
    third = create_business(client, login(client, ANA), "Segunda da Ana")
    assert third["id"] in [row["id"] for row in client.get("/atendimentos/businesses", headers=key("dono@empresa.com")).json()]
    login(client, BIA)
    assert [row["name"] for row in client.get("/atendimentos/businesses").json()] == ["Salão da Bia"]
    # The app itself needs the account: a Nexo panel session is not an Atendimentos session.
    client.cookies.clear()
    assert client.get("/atendimentos/businesses").status_code == 401


def test_appointments_can_be_searched_with_a_start_and_an_end_like_google_calendar(client):
    register(client, ANA)
    headers = login(client, ANA)
    business = create_business(client, headers)
    path = "/atendimentos/businesses/" + business["id"]
    for name, start, end in (("Antes", "2026-11-16T10:00:00Z", "2026-11-16T10:30:00Z"), ("Atravessa o início", "2026-11-16T11:30:00Z", "2026-11-16T12:30:00Z"),
                             ("Dentro", "2026-11-16T13:00:00Z", "2026-11-16T14:00:00Z"), ("Começa no fim", "2026-11-16T15:00:00Z", "2026-11-16T16:00:00Z"),
                             ("Depois", "2026-11-16T17:00:00Z", "2026-11-16T18:00:00Z")):
        assert client.post(path + "/appointments", headers=headers, json={"customer_name": name, "service_name": "Corte", "starts_at": start, "ends_at": end}).status_code == 201

    def names(**params):
        response = client.get(path + "/appointments", params={"limit": 100, **params})
        assert response.status_code == 200, response.text
        return [row["customer_name"] for row in response.json()]

    # Start/End as in Google Calendar: it is in the window when it ends after Start and begins before End.
    assert names(ends_after="2026-11-16T12:00:00Z", starts_until="2026-11-16T15:00:00Z") == ["Atravessa o início", "Dentro"]
    assert names(ends_after="2026-11-16T12:30:00Z", starts_until="2026-11-16T15:00:01Z") == ["Dentro", "Começa no fim"]   # ends exactly at Start: out
    assert names(ends_after="2026-11-16T17:30:00Z") == ["Depois"]          # only a start: from then on
    assert names(starts_until="2026-11-16T11:00:00Z") == ["Antes"]         # only an end: until then
    assert names(ends_after="2026-11-16T12:00:00Z", starts_from="2026-11-16T13:00:00Z", starts_until="2026-11-16T15:00:00Z") == ["Dentro"]


def test_appointments_show_who_booked_and_the_performance_of_each_person_with_everything_optional(client):
    register(client, ANA)
    headers = login(client, ANA)
    business = create_business(client, headers)
    path = "/atendimentos/businesses/" + business["id"]
    corte = client.post(path + "/services", headers=headers, json={"name": "Corte", "duration_minutes": 30, "price": "50.00"}).json()
    me = client.get("/atendimentos/auth/me").json()
    appointments = path + "/appointments"
    # The professional is required, so everything is attended; who booked it is still reported.
    attended = client.post(appointments, headers=headers, json={"customer_name": "João", "service_id": corte["id"],
                                                                 "staff_user_id": me["id"], "starts_at": "2026-12-01T13:00:00Z"}).json()
    loose = client.post(appointments, headers=headers, json={"customer_name": "Pedro", "service_id": corte["id"],
                                                              "starts_at": "2026-12-01T15:00:00Z"}).json()
    # Appointments made before the professional became required have none: they are still reported, as "Sem responsável".
    with client.app.state.services.repositories.transaction() as repos:
        repos.appointments.update(repos.appointments.get(loose["id"]), staff_user_id=None)
    loose = client.get(appointments + "/" + loose["id"]).json()
    assert attended["created_by_id"] == me["id"] and attended["created_by_name"] == "Ana" and attended["created_by_has_photo"] is False
    assert attended["staff_name"] == "Ana" and loose["staff_user_id"] is None and loose["staff_name"] is None
    assert loose["created_by_name"] == "Ana"
    client.patch(appointments + "/" + attended["id"], headers=headers, json={"status": "done"})
    client.patch(appointments + "/" + loose["id"], headers=headers, json={"status": "no_show"})

    report = client.get(path + "/performance", params={"starts_from": "2026-12-01T00:00:00Z", "starts_until": "2026-12-02T00:00:00Z"})
    assert report.status_code == 200, report.text
    data = report.json()
    assert data["total"] == 2 and data["done"] == 1 and data["revenue"] == 50.0
    by_name = {row["name"]: row for row in data["rows"]}
    assert by_name["Ana"]["total"] == 1 and by_name["Ana"]["done"] == 1 and by_name["Ana"]["created"] == 2 and by_name["Ana"]["revenue"] == 50.0
    assert by_name["Sem responsável"]["user_id"] is None and by_name["Sem responsável"]["no_show"] == 1
    # A period outside the data is all zeros but still lists the team.
    empty = client.get(path + "/performance", params={"starts_from": "2027-01-01T00:00:00Z", "starts_until": "2027-02-01T00:00:00Z"}).json()
    assert empty["total"] == 0 and [row["name"] for row in empty["rows"]] == ["Ana"]
    assert client.get(path + "/performance", params={"period": "month", "starts_from": "2026-12-01T00:00:00Z"}).status_code == 422


def test_an_appointment_takes_several_services_and_only_the_customer_name_is_required(client):
    register(client, ANA)
    headers = login(client, ANA)
    business = create_business(client, headers)
    path = "/atendimentos/businesses/" + business["id"]
    services = path + "/services"
    corte = client.post(services, headers=headers, json={"name": "Corte", "duration_minutes": 40, "price": "55.00"}).json()
    barba = client.post(services, headers=headers, json={"name": "Barba", "duration_minutes": 30, "price": "40.00"}).json()
    brinde = client.post(services, headers=headers, json={"name": "Hidratação", "duration_minutes": 15}).json()
    appointments = path + "/appointments"

    # Just the name: it starts now, rounded to the minute.
    now = client.post(appointments, headers=headers, json={"customer_name": "Zé"})
    assert now.status_code == 201, now.text
    assert now.json()["service_name"] == "Atendimento" and now.json()["starts_at"] and now.json()["ends_at"] > now.json()["starts_at"]

    # Two services: the end is the start plus 70 minutes and the price is 95.00; both services are kept.
    both = client.post(appointments, headers=headers, json={"customer_name": "Ana", "service_ids": [corte["id"], barba["id"]],
                                                            "starts_at": "2026-12-01T13:00:00Z"}).json()
    assert both["service_name"] == "Corte + Barba" and both["service_id"] is None and both["service_ids"] == [corte["id"], barba["id"]]
    assert both["ends_at"].startswith("2026-12-01T14:10:00") and both["price"] == 95.0
    # A service without a price adds time and nothing to the price.
    three = client.post(appointments, headers=headers, json={"customer_name": "Bia", "service_ids": [corte["id"], brinde["id"]],
                                                             "starts_at": "2026-12-02T13:00:00Z"}).json()
    assert three["ends_at"].startswith("2026-12-02T13:55:00") and three["price"] == 55.0
    # One service keeps its link.
    one = client.post(appointments, headers=headers, json={"customer_name": "Caio", "service_ids": [barba["id"]],
                                                           "starts_at": "2026-12-03T13:00:00Z"}).json()
    assert one["service_id"] == barba["id"] and one["service_ids"] == [barba["id"]] and one["ends_at"].startswith("2026-12-03T13:30:00")
    # Duration and price can be overridden.
    custom = client.post(appointments, headers=headers, json={"customer_name": "Davi", "service_ids": [corte["id"], barba["id"]],
                                                              "starts_at": "2026-12-04T13:00:00Z", "ends_at": "2026-12-04T15:00:00Z",
                                                              "price": "80.00"}).json()
    assert custom["ends_at"].startswith("2026-12-04T15:00:00") and custom["price"] == 80.0
    # An unknown service is refused.
    assert client.post(appointments, headers=headers, json={"customer_name": "X", "service_ids": ["nope"]}).status_code == 404

    # Changing the services recomputes the end and the price; moving keeps the duration; an explicit end or price wins.
    changed = client.patch(appointments + "/" + one["id"], headers=headers, json={"service_ids": [corte["id"], barba["id"]]}).json()
    assert changed["ends_at"].startswith("2026-12-03T14:10:00") and changed["price"] == 95.0 and changed["service_id"] is None
    moved = client.patch(appointments + "/" + both["id"], headers=headers, json={"starts_at": "2026-12-01T15:00:00Z"}).json()
    assert moved["ends_at"].startswith("2026-12-01T16:10:00") and moved["price"] == 95.0 and moved["service_ids"] == [corte["id"], barba["id"]]
    pinned = client.patch(appointments + "/" + three["id"], headers=headers, json={"service_ids": [barba["id"]], "price": "10.00"}).json()
    assert pinned["price"] == 10.0 and pinned["ends_at"].startswith("2026-12-02T13:30:00")


def test_appointments_arrive_in_real_time_and_new_bookings_are_pushed_with_the_business_name(client):
    import time

    register(client, ANA)
    ana = login(client, ANA)
    business = create_business(client, ana, "Barbearia do Zé")
    path = "/atendimentos/businesses/" + business["id"]
    token = parse_qs(urlsplit(client.post(path + "/invitations", headers=ana, json={"role": "staff"}).json()["url"]).query)["invite"][0]
    register(client, BIA)
    bia = login(client, BIA)
    assert client.post("/atendimentos/invitations/" + token + "/accept", headers=bia).status_code == 200
    bia_id = client.get("/atendimentos/auth/me").json()["id"]

    # The socket is per business and needs a one-time ticket; a stranger gets none.
    assert client.post("/atendimentos/realtime/ticket", headers=bia, params={"business_id": "nope"}).status_code == 404
    ticket = client.post("/atendimentos/realtime/ticket", headers=bia, params={"business_id": business["id"]}).json()["ticket"]
    with client.websocket_connect("/atendimentos/realtime", subprotocols=["nexo.v1", ticket], headers=dict(ORIGIN)) as socket:
        assert socket.receive_json() == {"type": "ready", "business_id": business["id"]}
        # The ticket is single-use.
        with pytest.raises(Exception):
            with client.websocket_connect("/atendimentos/realtime", subprotocols=["nexo.v1", ticket], headers=dict(ORIGIN)) as again:
                again.receive_json()

        push = Mock(enabled=True)
        client.app.state.services.scheduling.push = push
        ana = login(client, ANA)
        created = client.post(path + "/appointments", headers=ana, json={"customer_name": "Zé", "starts_at": "2026-12-01T13:00:00Z"}).json()
        event = socket.receive_json()
        assert event["type"] == "appointment.changed" and event["action"] == "created" and event["appointment_id"] == created["id"]
        assert event["customer_name"] == "Zé" and event["by_name"] == "Ana" and event["business_name"] == "Barbearia do Zé"
        for _ in range(50):
            if push.notify_users.called:
                break
            time.sleep(0.02)
        args = push.notify_users.call_args
        assert args.args[0] == [bia_id] and args.args[1] == "Barbearia do Zé" and "Ana marcou Zé" in args.args[2] and "01/12 às 10:00" in args.args[2]
        assert args.args[3] == "/atendimentos" and args.kwargs["tag"] == "appointment-" + created["id"]

        # Changes and removals are announced too, but only new bookings are pushed.
        push.notify_users.reset_mock()
        client.patch(path + "/appointments/" + created["id"], headers=ana, json={"status": "confirmed"})
        assert socket.receive_json()["action"] == "updated"
        client.delete(path + "/appointments/" + created["id"], headers=ana)
        assert socket.receive_json()["action"] == "deleted"
        assert not push.notify_users.called

    # Not a member of this business: no ticket.
    register(client, {**ANA, "name": "Caio", "email": "caio@example.com"})
    caio = login(client, {**ANA, "email": "caio@example.com"})
    assert client.post("/atendimentos/realtime/ticket", headers=caio, params={"business_id": business["id"]}).status_code == 404
    # The Atendimentos Web Push routes need the Atendimentos session.
    client.cookies.clear()
    assert client.get("/atendimentos/push/public-key").status_code == 401


def panel_session(client, role="owner", email="dono@empresa.com"):
    services = client.app.state.services
    with services.repositories.transaction() as repos:
        repos.users.create(name="Dono", email=email, status="approved", role=role, password_hash=services.passwords.hash(PANEL_PASSWORD))
    client.cookies.clear()
    assert client.post("/auth/login", headers=ORIGIN, json={"email": email, "password": PANEL_PASSWORD}).status_code == 200
    return {**ORIGIN, "X-CSRF-Token": client.get("/auth/csrf").json()["csrf_token"]}


def test_only_people_the_team_allows_can_use_the_atendimentos_with_links_approvals_expiry_and_live_updates(client):
    import time
    from datetime import timedelta

    from backend.repository.db.models.base import utc_now

    mails = Mock(return_value=True)
    client.app.state.services.booking_access.messages = Mock(booking_access_granted=mails)

    # Signing up alone leaves the account waiting: it can read and edit itself, and nothing else.
    register(client, BIA, approved=False)
    bia = login(client, BIA)
    me = client.get("/atendimentos/auth/me").json()
    assert me["access_status"] == "pending" and me["access_expires_at"] is None
    blocked = client.get("/atendimentos/businesses")
    assert blocked.status_code == 403 and "awaiting approval" in blocked.json()["detail"]
    assert client.post("/atendimentos/businesses", headers=bia, json={"name": "Salão", "opening_hours": HOURS}).status_code == 403
    assert client.put("/atendimentos/auth/profile", headers=bia, json={"name": "Bia Souza"}).status_code == 200
    ticket = client.post("/atendimentos/realtime/ticket", headers=bia).json()["ticket"]   # the account socket has no business

    # The owner's panel lists the waiting account; other panel roles cannot.
    owner = panel_session(client)
    waiting = client.get("/admin/atendimentos/users", params={"status": "pending"}).json()
    assert waiting["counts"]["pending"] == 1 and [row["email"] for row in waiting["users"]] == ["bia@example.com"]
    assert waiting["users"][0]["name"] == "Bia Souza" and waiting["users"][0]["status"] == "pending"
    client.cookies.clear()
    commercial = panel_session(client, "commercial", "vendas@empresa.com")
    assert client.get("/admin/atendimentos/users").status_code == 403
    assert client.post("/admin/atendimentos/links", headers=commercial, json={}).status_code == 403
    owner = panel_session(client, "owner", "dono2@empresa.com") if False else None
    client.cookies.clear()
    assert client.post("/auth/login", headers=ORIGIN, json={"email": "dono@empresa.com", "password": PANEL_PASSWORD}).status_code == 200
    owner = {**ORIGIN, "X-CSRF-Token": client.get("/auth/csrf").json()["csrf_token"]}

    # An access link with a 30-day permission: whoever signs up through it uses the product at once, and it is spent after one use.
    link = client.post("/admin/atendimentos/links", headers=owner, json={"note": "Caio", "access_days": 30}).json()
    assert "/atendimentos?access=" in link["url"] and link["access_days"] == 30 and link["max_uses"] == 1 and link["active"] is True
    token = parse_qs(urlsplit(link["url"]).query)["access"][0]
    assert client.get("/atendimentos/access/" + token).json() == {"access_days": 30}
    caio = {**ANA, "name": "Caio", "email": "caio@example.com"}
    joined = register(client, caio, approved=False, access_token=token)
    assert joined.status_code == 201 and joined.json()["access_status"] == "approved"
    assert 29 <= (datetime.fromisoformat(joined.json()["access_expires_at"]) - utc_now()).days <= 30
    assert client.get("/atendimentos/businesses").status_code == 200
    assert client.get("/atendimentos/access/" + token).status_code == 404          # the one use is gone
    dani = register(client, {**ANA, "name": "Dani", "email": "dani@example.com"}, approved=False, access_token=token)
    assert dani.status_code == 201 and dani.json()["access_status"] == "pending"      # too late: it waits like anyone
    assert client.get("/admin/atendimentos/links", headers=owner).status_code == 200

    # When the permission ends the person keeps the account but loses the product.
    approve(client, "caio@example.com", expires_at=utc_now() - timedelta(minutes=1))
    login(client, caio)
    assert client.get("/atendimentos/auth/me").json()["access_status"] == "expired"
    ended = client.get("/atendimentos/businesses")
    assert ended.status_code == 403 and "ended" in ended.json()["detail"]

    # Approving: with an end date or without one, announced live to the person and e-mailed.
    login(client, BIA)
    with client.websocket_connect("/atendimentos/realtime", subprotocols=["nexo.v1", ticket], headers=dict(ORIGIN)) as socket:
        assert socket.receive_json() == {"type": "ready", "business_id": None}
        client.cookies.clear()
        assert client.post("/auth/login", headers=ORIGIN, json={"email": "dono@empresa.com", "password": PANEL_PASSWORD}).status_code == 200
        owner = {**ORIGIN, "X-CSRF-Token": client.get("/auth/csrf").json()["csrf_token"]}
        biaid = waiting["users"][0]["id"]
        done = client.patch("/admin/atendimentos/users/" + biaid, headers=owner, json={"decision": "approved", "days": 7})
        assert done.status_code == 200 and done.json()["status"] == "approved" and done.json()["access_source"] == "approval"
        event = socket.receive_json()
        assert event["type"] == "access.changed" and event["status"] == "approved" and event["access_expires_at"]
        for _ in range(50):
            if mails.called:
                break
            time.sleep(0.02)
        assert mails.call_args.args[0].email == "bia@example.com" and mails.call_args.args[1] is not None
        # Taking it away is live too.
        client.patch("/admin/atendimentos/users/" + biaid, headers=owner, json={"decision": "rejected"})
        assert socket.receive_json()["status"] == "rejected"
    assert client.get("/admin/atendimentos/users", params={"status": "rejected"}).json()["users"][0]["email"] == "bia@example.com"
    spare = client.post("/admin/atendimentos/links", headers=owner, json={"access_days": 5}).json()
    login(client, BIA)
    removed = client.get("/atendimentos/businesses")
    assert removed.status_code == 403 and "removed" in removed.json()["detail"]
    # A removed account is not brought back by a link.
    assert client.post("/atendimentos/access/redeem", headers={**ORIGIN, "X-CSRF-Token": client.get("/atendimentos/auth/csrf").json()["csrf_token"]},
                       json={"token": parse_qs(urlsplit(spare["url"]).query)["access"][0]}).status_code == 403

    # Someone waiting who is invited to a business by an approved owner is approved by that invitation.
    register(client, ANA)
    ana = login(client, ANA)
    business = create_business(client, ana)
    invite = client.post("/atendimentos/businesses/" + business["id"] + "/invitations", headers=ana, json={"role": "staff"})
    assert invite.status_code == 201, invite.text
    invite = invite.json()
    invite_token = parse_qs(urlsplit(invite["url"]).query)["invite"][0]
    register(client, {**ANA, "name": "Eva", "email": "eva@example.com"}, approved=False)
    eva = login(client, {**ANA, "email": "eva@example.com"})
    assert client.get("/atendimentos/auth/me").json()["access_status"] == "pending"
    assert client.post("/atendimentos/invitations/" + invite_token + "/accept", headers=eva).status_code == 200
    assert client.get("/atendimentos/auth/me").json()["access_status"] == "approved"
    # Unknown or spent links answer 404 and a link can be deleted.
    assert client.get("/atendimentos/access/" + "x" * 43).status_code == 404
    client.cookies.clear()
    assert client.post("/auth/login", headers=ORIGIN, json={"email": "dono@empresa.com", "password": PANEL_PASSWORD}).status_code == 200
    owner = {**ORIGIN, "X-CSRF-Token": client.get("/auth/csrf").json()["csrf_token"]}
    first = client.get("/admin/atendimentos/links").json()[0]
    assert client.delete("/admin/atendimentos/links/" + first["id"], headers=owner).status_code == 204
    # The Nexo owner can delete an Atendimentos account; the businesses it owns go with it.
    anaid = next(row["id"] for row in client.get("/admin/atendimentos/users").json()["users"] if row["email"] == ANA["email"])
    assert client.delete("/admin/atendimentos/users/" + anaid, headers=ORIGIN).status_code in (401, 403)
    assert client.delete("/admin/atendimentos/users/" + anaid, headers=owner).status_code == 204
    assert client.delete("/admin/atendimentos/users/" + anaid, headers=owner).status_code == 404
    with client.app.state.services.repositories.read_transaction() as repos:
        assert repos.booking_users.get(anaid) is None and repos.businesses.get(business["id"]) is None
