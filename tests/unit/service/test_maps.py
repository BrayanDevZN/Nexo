import json
from contextlib import contextmanager
from datetime import datetime
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest
from pydantic import SecretStr

from backend.infra.connections.maps import MapsConnection, MapsUnavailable
from backend.service.maps import (
    MapsJobNotFound,
    MapsKeyRejected,
    MapsNotConfigured,
    MapsService,
    MapsUnauthorized,
)

JOB_ID = uuid4()
CSV = ("title,category,address,phone,website,emails,review_rating,review_count,latitude\n"
       "Padaria Santa Tereza,Padaria,Rua A 1,+55 11 1111-1111,https://a.example,,4.400000,120,-23.5\n"
       "Sem Nota,Padaria,Rua B 2,,,,,,-23.6\n")


class Credentials:
    def __init__(self):
        self.row = None

    def current(self):
        return self.row

    def replace(self, *, api_key_encrypted, key_prefix, updated_by_id):
        self.row = SimpleNamespace(api_key_encrypted=api_key_encrypted, key_prefix=key_prefix,
                                   updated_at=datetime(2026, 10, 23, 12, 0))
        return self.row

    def clear(self):
        had, self.row = self.row is not None, None
        return had


class Repositories:
    def __init__(self):
        self.maps_credentials = Credentials()

    @contextmanager
    def transaction(self):
        yield self

    read_transaction = transaction


def service(settings, handler, key="nexo_live_secret", repositories=None):
    settings.maps_url = "https://maps.example.com/"
    settings.maps_api_key = SecretStr(key) if key else None
    return MapsService(MapsConnection(settings, transport=httpx.MockTransport(handler)),
                       repositories or Repositories(), "unit-test-secret")


def test_requests_carry_the_nexo_key_and_job_list_is_normalized_newest_first(settings):
    seen = []

    def handler(request):
        seen.append((request.url.host, request.headers["authorization"]))
        return httpx.Response(200, json=[
            {"ID": "a", "Name": "Antiga", "Status": "ok", "Date": "2026-10-01T10:00:00Z"},
            {"ID": "b", "Name": "Nova", "Status": "Working", "Date": "2026-10-02T10:00:00Z"}])

    jobs = service(settings, handler).jobs()
    assert [job["id"] for job in jobs] == ["b", "a"]
    assert jobs[0]["status"] == "working"
    assert seen == [("maps.example.com", "Bearer nexo_live_secret")]


def test_an_empty_job_list_is_an_empty_array(settings):
    assert service(settings, lambda request: httpx.Response(200, content=b"null")).jobs() == []


def test_create_sends_the_scraper_payload_with_string_coordinates(settings):
    sent = {}

    def handler(request):
        sent.update(json.loads(request.content))
        return httpx.Response(201, json={"id": str(JOB_ID)})

    result = service(settings, handler).create({
        "name": "Teste", "keywords": ["padaria"], "lang": "pt", "zoom": 15, "lat": -23.55, "lon": -46.63,
        "radius": 2000, "depth": 1, "email": False, "fast_mode": False, "max_time": 120})
    assert result == {"id": str(JOB_ID)}
    assert sent["lat"] == "-23.55" and sent["lon"] == "-46.63" and sent["keywords"] == ["padaria"]


def test_results_keep_only_lead_fields_and_cap_the_rows(settings, monkeypatch):
    rows = service(settings, lambda request: httpx.Response(200, content=CSV.encode())).results(JOB_ID)
    assert rows["total"] == 2 and rows["truncated"] is False
    first, second = rows["rows"]
    assert first["title"] == "Padaria Santa Tereza" and first["review_rating"] == 4.4 and first["review_count"] == 120
    assert "latitude" not in first
    assert second["phone"] is None and second["review_rating"] is None and second["review_count"] is None
    monkeypatch.setattr("backend.service.maps.MAX_ROWS", 1)
    capped = service(settings, lambda request: httpx.Response(200, content=CSV.encode())).results(JOB_ID)
    assert len(capped["rows"]) == 1 and capped["total"] == 2 and capped["truncated"] is True


def test_upstream_failures_map_to_specific_errors(settings):
    with pytest.raises(MapsUnauthorized):
        service(settings, lambda request: httpx.Response(401)).jobs()
    with pytest.raises(MapsJobNotFound):
        service(settings, lambda request: httpx.Response(404)).job(JOB_ID)
    with pytest.raises(MapsUnavailable):
        service(settings, lambda request: httpx.Response(500)).jobs()

    def down(request):
        raise httpx.ConnectError("offline")

    with pytest.raises(MapsUnavailable):
        service(settings, down).jobs()


def test_without_a_key_the_server_is_not_configured(settings):
    with pytest.raises(MapsNotConfigured):
        service(settings, lambda request: httpx.Response(200, json=[]), key=None).jobs()


ACTOR = SimpleNamespace(id="user-1")
PANEL_KEY = "nexo_live_panelkey1234"


def test_a_key_saved_from_the_panel_is_verified_encrypted_and_used_instead_of_the_env_key(settings):
    seen = []

    def handler(request):
        seen.append(request.headers["authorization"])
        return httpx.Response(200, content=b"null")

    repositories = Repositories()
    maps = service(settings, handler, repositories=repositories)
    assert maps.status()["source"] == "environment"
    status = maps.save_key(ACTOR, PANEL_KEY)
    assert status["source"] == "panel" and status["key_prefix"] == PANEL_KEY[:14] and status["configured"] is True
    assert PANEL_KEY not in repositories.maps_credentials.row.api_key_encrypted
    maps.jobs()
    assert seen == [f"Bearer {PANEL_KEY}", f"Bearer {PANEL_KEY}"]
    assert maps.clear_key()["source"] == "environment"
    maps.jobs()
    assert seen[-1] == "Bearer nexo_live_secret"


def test_a_key_the_maps_server_rejects_is_not_saved(settings):
    repositories = Repositories()
    maps = service(settings, lambda request: httpx.Response(401), repositories=repositories)
    with pytest.raises(MapsKeyRejected):
        maps.save_key(ACTOR, PANEL_KEY)
    assert repositories.maps_credentials.row is None


def test_a_saved_key_that_cannot_be_decrypted_is_ignored(settings):
    repositories = Repositories()
    maps = service(settings, lambda request: httpx.Response(200, content=b"null"), key=None, repositories=repositories)
    maps.save_key(ACTOR, PANEL_KEY)
    other = MapsService(maps.connection, repositories, "a-different-secret")
    assert other.status() == {"configured": False, "source": None, "key_prefix": None, "updated_at": None}
