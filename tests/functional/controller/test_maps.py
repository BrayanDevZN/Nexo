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
