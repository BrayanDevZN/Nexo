import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from backend.controller.application import create_app
from backend.domain.passwords import PasswordHasher
from tests.functional.controller.test_databases import PASSWORD, add_member, sign_in

JOB = "3f2c1c1e-0000-4000-8000-000000000001"
BODY = {"keywords": ["padaria"], "lat": -23.55, "lon": -46.63, "depth": 1}


@pytest.fixture
def client(settings, local_redis_url, monkeypatch):
    settings.redis_url = SecretStr(local_redis_url)
    settings.email = "owner@example.com"
    settings.password = SecretStr("initial-admin-password")
    settings.qdrant_url = None
    settings.maps_url = "https://maps.example.com"
    settings.maps_api_key = SecretStr("nexo_live_secret")
    monkeypatch.setattr("backend.service.runtime.PasswordHasher", lambda: PasswordHasher(rounds=4))
    calls = []

    def handler(request):
        calls.append((request.method, request.url.path))
        if request.headers["authorization"] == "Bearer nexo_live_rejected00":
            return httpx.Response(401)
        if request.method == "GET" and request.url.path == "/api/v1/jobs":
            return httpx.Response(200, json=[{"ID": JOB, "Name": "Teste", "Status": "ok", "Date": "2026-10-23"}])
        if request.method == "POST":
            return httpx.Response(201, json={"id": JOB})
        if request.url.path.endswith("/download"):
            return httpx.Response(200, content=b"title,category\nPadaria X,Padaria\n")
        if request.method == "DELETE":
            return httpx.Response(200)
        return httpx.Response(200, json={"ID": JOB, "Name": "Teste", "Status": "working"})

    with TestClient(create_app(settings)) as test_client:
        test_client.upstream_calls = calls
        test_client.app.state.services.maps.connection._client = httpx.Client(
            base_url="https://maps.example.com", transport=httpx.MockTransport(handler))
        yield test_client


def test_owner_runs_the_whole_search_flow(client):
    headers = sign_in(client)
    assert client.get("/maps/jobs").json()[0]["id"] == JOB
    created = client.post("/maps/jobs", headers=headers, json=BODY)
    assert created.status_code == 201 and created.json() == {"id": JOB}
    assert client.get(f"/maps/jobs/{JOB}").json()["status"] == "working"
    results = client.get(f"/maps/jobs/{JOB}/results").json()
    assert results["rows"][0]["title"] == "Padaria X" and results["total"] == 1
    assert client.delete(f"/maps/jobs/{JOB}", headers=headers).status_code == 204
    assert ("DELETE", f"/api/v1/jobs/{JOB}") in client.upstream_calls


def test_commercial_members_are_allowed_and_developers_are_not(client):
    add_member(client, "commercial")
    sign_in(client, "commercial@example.com", PASSWORD)
    assert client.get("/maps/jobs").status_code == 200
    add_member(client, "dev")
    sign_in(client, "dev@example.com", PASSWORD)
    assert client.get("/maps/jobs").status_code == 403


def test_the_search_form_is_validated_before_calling_the_server(client):
    headers = sign_in(client)
    for bad in ({**BODY, "lat": 123}, {**BODY, "keywords": []}, {**BODY, "keywords": [" "]},
                {**BODY, "max_time": 5}, {**BODY, "extra": 1}):
        assert client.post("/maps/jobs", headers=headers, json=bad).status_code == 422
    assert client.get("/maps/jobs/not-a-uuid").status_code == 422
    assert client.upstream_calls == []


def test_only_a_signed_in_session_works_not_an_api_key(client):
    headers = sign_in(client)
    key = client.post("/auth/api-keys", headers=headers, json={"name": "maps"}).json()["key"]
    client.cookies.clear()
    assert client.get("/maps/jobs").status_code == 401
    assert client.get("/maps/jobs", headers={"Authorization": f"Bearer {key}"}).status_code == 401
    assert client.upstream_calls == []


def test_an_unconfigured_maps_server_answers_503(client):
    sign_in(client)
    client.app.state.services.maps.connection._client = None
    response = client.get("/maps/jobs")
    assert response.status_code == 503 and "not configured" in response.json()["detail"]


def test_developers_save_and_remove_the_maps_key_and_it_is_never_returned(client):
    headers = sign_in(client)
    assert client.get("/maps/status").json()["source"] == "environment"
    saved = client.put("/maps/key", headers=headers, json={"api_key": "nexo_live_panelkey1234"})
    assert saved.status_code == 200
    assert saved.json()["source"] == "panel" and saved.json()["key_prefix"] == "nexo_live_pane"
    assert "panelkey1234" not in saved.text and "panelkey1234" not in client.get("/maps/status").text
    cleared = client.delete("/maps/key", headers=headers)
    assert cleared.status_code == 200 and cleared.json()["source"] == "environment"


def test_a_rejected_or_malformed_key_is_not_saved(client):
    headers = sign_in(client)
    rejected = client.put("/maps/key", headers=headers, json={"api_key": "nexo_live_rejected00"})
    assert rejected.status_code == 400
    assert client.put("/maps/key", headers=headers, json={"api_key": "not-a-nexo-key"}).status_code == 422
    assert client.get("/maps/status").json()["source"] == "environment"


def test_commercial_members_save_their_own_key_without_touching_the_others(client):
    add_member(client, "commercial")
    owner = sign_in(client)
    assert client.put("/maps/key", headers=owner, json={"api_key": "nexo_live_ownerkey1234"}).json()["own"] is True
    headers = sign_in(client, "commercial@example.com", PASSWORD)
    assert client.get("/maps/status").json()["own"] is False  # still on the environment key
    saved = client.put("/maps/key", headers=headers, json={"api_key": "nexo_live_commkey12345"})
    assert saved.status_code == 200 and saved.json()["own"] is True and saved.json()["key_prefix"].startswith("nexo_live_comm")
    assert client.delete("/maps/key", headers=headers).json()["own"] is False
    owner = sign_in(client)
    assert client.get("/maps/status").json()["key_prefix"].startswith("nexo_live_owne")


def test_developers_who_cannot_use_maps_cannot_save_a_maps_key(client):
    add_member(client, "dev")
    headers = sign_in(client, "dev@example.com", PASSWORD)
    assert client.put("/maps/key", headers=headers, json={"api_key": "nexo_live_devkey123456"}).status_code == 403


def test_leads_are_saved_to_the_funnel_and_repeats_are_skipped(client):
    headers = sign_in(client)
    body = {"niche": "Alimentação", "leads": [{"title": "Padaria X", "address": "Rua A, 1", "latitude": -23.5, "longitude": -46.6}]}
    first = client.post("/maps/funnel", headers=headers, json=body)
    assert first.status_code == 201 and first.json()["created"] == 1
    assert client.post("/maps/funnel", headers=headers, json=body).json()["skipped"] == 1
    saved = client.get("/clients", params={"name": "Padaria X"}).json()[0]
    assert saved["pipeline_stage"] == "lead" and saved["address"] == "Rua A, 1"
    assert client.post("/maps/funnel", headers=headers, json={**body, "niche": "Inexistente"}).status_code == 422
    assert client.post("/maps/funnel", headers=headers, json={"niche": "Varejo", "leads": []}).status_code == 422


def test_the_chosen_contact_channel_is_kept_on_the_saved_leads(client):
    headers = sign_in(client)
    body = {"niche": "Alimentação", "leads": [{"title": "Padaria Z", "phone": "(11) 99999-1111"}], "sales_channel": "whatsapp"}
    assert client.post("/maps/funnel", headers=headers, json=body).status_code == 201
    assert client.get("/clients", params={"name": "Padaria Z"}).json()[0]["sales_channel"] == "whatsapp"
    assert client.post("/maps/funnel", headers=headers, json={**body, "sales_channel": "pombo"}).status_code == 422
    assert client.post("/maps/funnel/batches", headers=headers, json={**body, "sales_channel": "pombo"}).status_code == 422


def test_saved_leads_no_longer_appear_in_results(client):
    headers = sign_in(client)
    assert client.get(f"/maps/jobs/{JOB}/results").json()["total"] == 1
    client.post("/maps/funnel", headers=headers, json={"niche": "Alimentação", "leads": [{"title": "Padaria X"}]})
    results = client.get(f"/maps/jobs/{JOB}/results").json()
    assert results["rows"] == [] and results["total"] == 0 and results["in_funnel"] == 1


def test_commercial_members_generate_keys_that_only_reach_clients_and_the_maps_check(client):
    add_member(client, "commercial")
    headers = sign_in(client, "commercial@example.com", PASSWORD)
    created = client.post("/auth/api-keys", headers=headers, json={"name": "meu maps"})
    assert created.status_code == 201
    key = {"Authorization": "Bearer " + created.json()["key"]}
    assert client.get("/auth/api-keys/usage", headers=headers).status_code == 200
    assert client.get("/clients", headers=key).status_code == 200
    assert client.get("/auth/api-keys/validate", headers=key).json() == {"valid": True}
    for path in ("/documents", "/dashboard", "/automations", "/notifications"):
        assert client.get(path, headers=key).status_code == 403, path


def test_developer_keys_reach_the_whole_api(client):
    headers = sign_in(client)
    key = {"Authorization": "Bearer " + client.post("/auth/api-keys", headers=headers, json={"name": "tudo"}).json()["key"]}
    for path in ("/clients", "/documents", "/dashboard", "/automations"):
        assert client.get(path, headers=key).status_code == 200, path


def test_leads_are_saved_in_the_background_with_progress(client):
    import time
    headers = sign_in(client)
    body = {"niche": "Alimentação", "leads": [{"title": "Padaria 1"}, {"title": "Padaria 2"}, {"title": "Padaria 1"}]}
    started = client.post("/maps/funnel/batches", headers=headers, json=body)
    assert started.status_code == 202 and started.json()["total"] == 3
    batch = started.json()["id"]
    for _ in range(100):
        status = client.get(f"/maps/funnel/batches/{batch}").json()
        if status["finished"]:
            break
        time.sleep(0.05)
    assert status["items"] == ["created", "created", "duplicate"] and status["done"] == 3
    assert {row["name"] for row in client.get("/clients").json()} >= {"Padaria 1", "Padaria 2"}
    assert client.get("/maps/funnel/batches/unknown").status_code == 404
    assert client.post("/maps/funnel/batches", headers=headers, json={"niche": "Inexistente", "leads": [{"title": "x"}]}).status_code == 422
    assert client.post("/maps/funnel/batches", headers=headers, json={"niche": "Varejo", "leads": []}).status_code == 422
