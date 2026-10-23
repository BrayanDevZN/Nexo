from unittest.mock import Mock
from uuid import uuid4

import httpx
import pytest
from pydantic import SecretStr

from backend.domain.passwords import PasswordHasher
from backend.service.runtime import RuntimeServices

JOB = str(uuid4())
CSV = (b"title,category,address,phone\n"
       b"Padaria Nova,Padaria,Rua A 1,+55 11 91111-1111\n"
       b"Padaria Antiga,Padaria,Rua B 2,+55 11 92222-2222\n")
BODY = {"name": "Padarias", "niche": "Alimentação", "keywords": ["padaria"], "lang": "pt", "zoom": 15, "lat": -23.5,
        "lon": -46.6, "radius": 2000, "depth": 1, "email": False, "fast_mode": False, "max_time": 120}


@pytest.fixture
def runtime(settings, local_redis_url, monkeypatch, tmp_path):
    settings.redis_url = SecretStr(local_redis_url)
    settings.upload_dir = tmp_path / "photos"
    settings.maps_url = "https://maps.example.com"
    settings.maps_api_key = SecretStr("nexo_live_secret")
    monkeypatch.setattr("backend.service.runtime.PasswordHasher", lambda: PasswordHasher(rounds=4))
    status = {"value": "working"}

    def handler(request):
        if request.method == "POST":
            return httpx.Response(201, json={"id": JOB})
        if request.url.path.endswith("/download"):
            return httpx.Response(200, content=CSV)
        return httpx.Response(200, json=[{"ID": JOB, "Name": "Padarias", "Status": status["value"], "Date": "2026-10-23"}])

    service = RuntimeServices(settings)
    service.initialize(settings)
    service.maps.connection._client = httpx.Client(base_url="https://maps.example.com", transport=httpx.MockTransport(handler))
    service.maps.messages, service.maps.push = Mock(), Mock()
    with service.repositories.transaction() as repos:
        actor = repos.users.create(name="Member", email="member@example.com", google_sub="member-google",
                                   phone="11999999999", status="approved")
    yield service, actor, status
    service.close()


def test_creator_is_told_once_when_the_search_finishes(runtime):
    service, actor, status = runtime
    service.clients.messages = Mock()
    service.clients.import_leads(actor, "Alimentação", [{"title": "Padaria Antiga"}])
    service.maps.create(BODY, actor.id)

    assert service.maps.finish_pending() == 0  # still running
    assert service.maps.messages.maps_results.call_count == 0

    status["value"] = "ok"
    assert service.maps.finish_pending() == 1
    assert service.maps.finish_pending() == 0  # never announced twice

    notices = [notice for notice in service.announcements.list_for_user(actor) if notice["title"] == "Busca do Maps concluída"]
    assert len(notices) == 1 and "1 empresa(s) nova(s)" in notices[0]["body"] and "1 já estavam no funil" in notices[0]["body"]
    args = service.maps.messages.maps_results.call_args.args
    assert args[0].email == "member@example.com" and args[1] == JOB and args[2] == "Padarias"
    assert args[3] == 1 and args[4] == 1 and [lead["title"] for lead in args[5]] == ["Padaria Nova"]
    service.maps.push.notify_users.assert_called_once()
    assert service.maps.push.notify_users.call_args.kwargs["url"] == "/admin?maps=" + JOB


def test_failed_search_is_reported(runtime):
    service, actor, status = runtime
    service.maps.create(BODY, actor.id)
    status["value"] = "failed"
    assert service.maps.finish_pending() == 1
    service.maps.messages.maps_failed.assert_called_once()
    assert service.maps.messages.maps_results.call_count == 0
