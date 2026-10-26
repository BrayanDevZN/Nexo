import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from backend.controller.application import create_app
from backend.domain.passwords import PasswordHasher

ORIGIN = {"Origin": "http://localhost:5173"}
VISIT = {"page": "contabilidade", "origin": "google-ads", "click_id": "gclid-1"}


@pytest.fixture
def client(settings, local_redis_url, monkeypatch, tmp_path):
    settings.redis_url = SecretStr(local_redis_url)
    settings.upload_dir = tmp_path / "photos"
    settings.email = "owner@example.com"
    settings.password = SecretStr("initial-admin-password")
    monkeypatch.setattr("backend.service.runtime.PasswordHasher", lambda: PasswordHasher(rounds=4))
    with TestClient(create_app(settings)) as client:
        yield client


def login(client):
    assert client.post("/auth/login", headers=ORIGIN, json={"email": "owner@example.com", "password": "initial-admin-password"}).status_code == 200
    return {**ORIGIN, "X-CSRF-Token": client.get("/auth/csrf").json()["csrf_token"]}


def test_the_site_records_the_visit_then_the_whatsapp_click_without_any_login(client):
    visit = client.post("/public/paid-leads/visit", headers=ORIGIN, json=VISIT)
    assert visit.status_code == 201 and visit.headers["cache-control"] == "no-store"
    lead_id = visit.json()["id"]
    assert client.post(f"/public/paid-leads/{lead_id}/whatsapp", headers=ORIGIN, json={"placement": "hero"}).json() == {"ok": True}
    headers = login(client)
    rows = client.get("/paid-leads").json()
    assert [(row["id"], row["stage"], row["placement"], row["click_id"], row["source"]) for row in rows] == [
        (lead_id, "whatsapp_click", "hero", "gclid-1", "google-ads")]
    assert client.get("/clients").json() == []  # a separate table: nothing was added to the clients
    assert headers


def test_organic_visits_are_not_stored(client):
    assert client.post("/public/paid-leads/visit", headers=ORIGIN, json={"page": "contabilidade"}).json() == {"id": None}
    assert client.post("/public/paid-leads/visit", headers=ORIGIN, json={**VISIT, "origin": "instagram"}).json() == {"id": None}
    login(client)
    assert client.get("/paid-leads").json() == []


def test_public_routes_refuse_other_origins_and_bad_input(client):
    assert client.post("/public/paid-leads/visit", headers={"Origin": "https://evil.example"}, json=VISIT).status_code == 403
    assert client.post("/public/paid-leads/visit", json=VISIT).status_code == 403
    assert client.post("/public/paid-leads/visit", headers=ORIGIN, json={**VISIT, "page": "x"}).status_code == 422
    assert client.post("/public/paid-leads/not-an-id/whatsapp", headers=ORIGIN, json={"placement": "hero"}).status_code == 422
    unknown = "00000000-0000-0000-0000-000000000000"
    assert client.post(f"/public/paid-leads/{unknown}/whatsapp", headers=ORIGIN, json={"placement": "hero"}).json() == {"ok": True}


def test_the_team_manages_the_leads_with_login_and_csrf(client):
    lead_id = client.post("/public/paid-leads/visit", headers=ORIGIN, json=VISIT).json()["id"]
    assert client.get("/paid-leads").status_code == 401
    headers = login(client)
    assert client.patch(f"/paid-leads/{lead_id}", headers=ORIGIN, json={"stage": "won"}).status_code == 403  # no CSRF token
    row = client.patch(f"/paid-leads/{lead_id}", headers=headers, json={"stage": "meeting", "name": "Maria", "phone": "(31) 99999-8888", "contract_value": "1200"}).json()
    assert (row["stage"], row["name"], row["phone"], row["contract_value"]) == ("meeting", "Maria", "+5531999998888", "1200")
    assert client.patch(f"/paid-leads/{lead_id}", headers=headers, json={"stage": "nonsense"}).status_code == 422
    assert client.patch("/paid-leads/missing", headers=headers, json={"stage": "won"}).status_code == 404
    assert client.get("/paid-leads", params={"stage": "meeting"}).json()[0]["id"] == lead_id
    assert client.get("/paid-leads", params={"stage": "lost"}).json() == []
    assert client.delete(f"/paid-leads/{lead_id}", headers=headers).status_code == 204
    assert client.get("/paid-leads").json() == []


def test_one_address_cannot_flood_the_visit_route(client):
    codes = [client.post("/public/paid-leads/visit", headers=ORIGIN, json={**VISIT, "click_id": f"g{i}"}).status_code for i in range(24)]
    assert codes[:20] == [201] * 20 and set(codes[20:]) == {429}
