import json
from unittest.mock import Mock
from uuid import uuid4

import httpx
import pytest
from pydantic import SecretStr

from backend.domain.passwords import PasswordHasher
from backend.service.runtime import RuntimeServices

HEADER = b"title,category,address,phone\n"
FOUND = HEADER + b"Contabil Alfa,Contador,Rua A 1,+55 31 99999-1111\n"
BODY = {"name": "Contabilidade · São Paulo (SP)", "niche": "Contabilidade", "keywords": ["contador"], "lang": "pt", "zoom": 15,
        "lat": -23.5505, "lon": -46.6333, "radius": 5000, "depth": 3, "email": False, "fast_mode": False, "max_time": 300}


class FakeMapsServer:
    """Every search finishes at once. `found_from` is the radius from which the map has companies."""

    def __init__(self, found_from=None):
        self.found_from, self.jobs, self.found = found_from, {}, FOUND

    def handler(self, request):
        if request.method == "POST":
            body = json.loads(request.content)
            job_id = str(uuid4())
            self.jobs[job_id] = body
            return httpx.Response(201, json={"id": job_id})
        path = request.url.path
        if path.endswith("/download"):
            job = self.jobs[path.split("/")[-2]]
            return httpx.Response(200, content=self.found if self.found_from and job["radius"] >= self.found_from else HEADER)
        if path == "/api/v1/jobs":
            return httpx.Response(200, json=[{"ID": key, "Name": job["name"], "Status": "ok", "Date": "2026-10-27"} for key, job in self.jobs.items()])
        job_id = path.split("/")[-1]
        return httpx.Response(200, json={"ID": job_id, "Name": self.jobs[job_id]["name"], "Status": "ok", "Date": "2026-10-27"})

    def radii(self):
        return [job["radius"] for job in self.jobs.values()]


@pytest.fixture
def make(settings, local_redis_url, monkeypatch, tmp_path):
    settings.redis_url = SecretStr(local_redis_url)
    settings.upload_dir = tmp_path / "photos"
    settings.maps_url = "https://maps.example.com"
    settings.maps_api_key = SecretStr("nexo_live_secret")
    monkeypatch.setattr("backend.service.runtime.PasswordHasher", lambda: PasswordHasher(rounds=4))
    services = []

    def build(found_from=None):
        server = FakeMapsServer(found_from)
        service = RuntimeServices(settings)
        service.initialize(settings)
        service.maps.connection._client = httpx.Client(base_url="https://maps.example.com", transport=httpx.MockTransport(server.handler))
        service.maps.messages, service.maps.push = Mock(), Mock()
        with service.repositories.transaction() as repos:
            actor = repos.users.create(name="Member", email="member@example.com", google_sub="member-google",
                                       phone="11999999999", status="approved")
        services.append(service)
        return service, actor, server

    yield build
    for service in services:
        service.close()


def notices(service, actor):
    return [notice["body"] for notice in service.announcements.list_for_user(actor) if notice["title"] == "Busca do Maps concluída"]


def test_a_search_in_the_default_place_widens_until_it_finds_and_is_announced_once(make):
    service, actor, server = make(found_from=20000)
    service.maps.create({**BODY, "auto_expand": True}, actor.id)
    assert service.maps.finish_pending() == 0 and server.radii() == [5000, 10000]  # empty: wider search, nothing announced yet
    assert service.maps.finish_pending() == 0 and server.radii() == [5000, 10000, 20000]
    assert service.maps.finish_pending() == 1 and server.radii() == [5000, 10000, 20000]  # found: stop and announce
    assert service.maps.finish_pending() == 0
    [body] = notices(service, actor)
    assert "1 empresa(s) nova(s)" in body and "ampliado de 5 km para 20 km" in body
    names = [job["name"] for job in server.jobs.values()]
    assert names == ["Contabilidade · São Paulo (SP)", "Contabilidade · São Paulo (SP) · 10 km", "Contabilidade · São Paulo (SP) · 20 km"]


def test_widening_stops_at_the_maximum_radius_and_says_nothing_was_found(make):
    service, actor, server = make(found_from=None)
    service.maps.create({**BODY, "auto_expand": True}, actor.id)
    for _ in range(4):
        assert service.maps.finish_pending() == 0
    assert server.radii() == [5000, 10000, 20000, 40000, 50000]
    assert service.maps.finish_pending() == 1 and server.radii() == [5000, 10000, 20000, 40000, 50000]
    [body] = notices(service, actor)
    assert "não encontrou nenhuma empresa" in body and "de 5 km até 50 km" in body


def test_a_place_typed_by_the_user_is_searched_only_in_that_perimeter(make):
    service, actor, server = make(found_from=20000)
    service.maps.create({**BODY, "radius": 2000, "auto_expand": False}, actor.id)
    assert service.maps.finish_pending() == 1 and server.radii() == [2000]
    [body] = notices(service, actor)
    assert "não encontrou nenhuma empresa" in body and "nem ampliando" not in body
    assert service.maps.results(next(iter(server.jobs)), actor.id)["expanded_to"] is None


def test_opening_the_results_of_an_empty_search_widens_it_once(make):
    service, actor, server = make(found_from=10000)
    job_id = service.maps.create({**BODY, "auto_expand": True}, actor.id)["id"]
    first = service.maps.results(job_id, actor.id)
    assert first["total"] == 0 and first["auto_expand"] is True and first["radius"] == 5000 and first["start_radius"] == 5000
    assert first["expanded_to"] and server.radii() == [5000, 10000]
    assert service.maps.results(job_id, actor.id)["expanded_to"] == first["expanded_to"]
    assert server.radii() == [5000, 10000]  # asking again does not start another search
    wider = service.maps.results(first["expanded_to"], actor.id)
    assert wider["total"] == 1 and wider["radius"] == 10000 and wider["start_radius"] == 5000 and wider["expanded_to"] is None


def test_a_search_that_found_companies_is_never_widened(make):
    service, actor, server = make(found_from=1)
    job_id = service.maps.create({**BODY, "auto_expand": True}, actor.id)["id"]
    assert service.maps.results(job_id, actor.id)["expanded_to"] is None
    assert service.maps.finish_pending() == 1 and server.radii() == [5000]


def test_the_limit_chosen_for_a_search_is_enforced_by_the_server(make):
    service, actor, server = make(found_from=1)
    server.found = HEADER + b"".join(f"Empresa {n},Contador,Rua {n},+55 31 98888-{n:04d}\n".encode() for n in range(30))
    job_id = service.maps.create({**BODY, "auto_expand": True, "limit": 20}, actor.id)["id"]
    shown = service.maps.results(job_id, actor.id)
    assert len(shown["rows"]) == 20 and shown["total"] == 30 and shown["truncated"] is True and shown["limit"] == 20
    other = service.maps.create({**BODY, "auto_expand": True}, actor.id)["id"]
    assert service.maps.results(other, actor.id)["limit"] is None


def test_widen_starts_a_bigger_search_once_even_when_the_map_had_companies(make):
    service, actor, server = make(found_from=1)
    job_id = service.maps.create({**BODY, "auto_expand": True, "limit": 20}, actor.id)["id"]
    assert service.maps.results(job_id, actor.id)["expanded_to"] is None
    new_id = service.maps.widen(job_id, actor.id)["expanded_to"]
    assert new_id and server.radii() == [5000, 10000]
    assert service.maps.widen(job_id, actor.id)["expanded_to"] == new_id and server.radii() == [5000, 10000]
    assert service.maps.results(new_id, actor.id)["limit"] == 20
