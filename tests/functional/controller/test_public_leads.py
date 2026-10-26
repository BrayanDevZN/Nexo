import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from backend.controller.application import create_app
from backend.domain.passwords import PasswordHasher

ORIGIN = {"Origin": "http://localhost:5173"}
LEAD = {"name": "Maria Souza", "phone": "(31) 99999-8888", "email": "", "page": "contabilidade", "consent": True,
        "origin": "google-ads", "click_id": "gclid-1"}


@pytest.fixture
def client(settings, local_redis_url, monkeypatch, tmp_path):
    settings.redis_url = SecretStr(local_redis_url)
    settings.upload_dir = tmp_path / "photos"
    settings.email = "owner@example.com"
    settings.password = SecretStr("initial-admin-password")
    monkeypatch.setattr("backend.service.runtime.PasswordHasher", lambda: PasswordHasher(rounds=4))
    with TestClient(create_app(settings)) as client:
        yield client


def owner_rows(client):
    assert client.post("/auth/login", headers=ORIGIN, json={"email": "owner@example.com", "password": "initial-admin-password"}).status_code == 200
    return client.get("/clients").json()


def test_a_visitor_can_leave_a_lead_without_logging_in(client):
    response = client.post("/public/leads", headers=ORIGIN, json=LEAD)
    assert response.status_code == 201 and response.json() == {"ok": True}
    assert response.headers["cache-control"] == "no-store"
    rows = owner_rows(client)
    assert [(row["name"], row["phone"], row["sales_channel"], row["pipeline_stage"]) for row in rows] == [
        ("Maria Souza", "+5531999998888", "google_ads", "lead")]


def test_requests_from_another_origin_or_without_consent_are_refused(client):
    assert client.post("/public/leads", headers={"Origin": "https://evil.example"}, json=LEAD).status_code == 403
    assert client.post("/public/leads", json=LEAD).status_code == 403
    assert client.post("/public/leads", headers=ORIGIN, json={**LEAD, "consent": False}).status_code == 422
    assert owner_rows(client) == []


def test_the_hidden_field_makes_a_bot_look_successful_but_saves_nothing(client):
    response = client.post("/public/leads", headers=ORIGIN, json={**LEAD, "website": "http://spam.example"})
    assert response.status_code == 201 and response.json() == {"ok": True}
    assert owner_rows(client) == []


def test_a_known_phone_gets_the_same_answer_and_no_duplicate(client):
    assert client.post("/public/leads", headers=ORIGIN, json=LEAD).status_code == 201
    assert client.post("/public/leads", headers=ORIGIN, json={**LEAD, "name": "Outra Pessoa"}).json() == {"ok": True}
    assert len(owner_rows(client)) == 1


def test_one_address_can_only_send_a_few_leads_per_window(client):
    codes = [client.post("/public/leads", headers=ORIGIN, json={**LEAD, "phone": f"3199999{i:04d}"}).status_code for i in range(8)]
    assert codes[:5] == [201] * 5 and codes[5:] == [429] * 3
