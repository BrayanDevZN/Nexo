import threading
import time
from unittest.mock import Mock

import pytest
from pydantic import SecretStr

from backend.domain.passwords import PasswordHasher
from backend.service.access import ResourceConflict, ResourceNotFound
from backend.service.runtime import RuntimeServices


@pytest.fixture
def runtime(settings, local_redis_url, monkeypatch, tmp_path):
    settings.redis_url = SecretStr(local_redis_url)
    settings.upload_dir = tmp_path / "photos"
    monkeypatch.setattr("backend.service.runtime.PasswordHasher", lambda: PasswordHasher(rounds=4))
    service = RuntimeServices(settings)
    service.initialize(settings)
    with service.repositories.transaction() as repos:
        actor = repos.users.create(name="Ana", email="ana@example.com", google_sub="ana", phone="11999999999",
                                   status="approved", role="commercial")
        other = repos.users.create(name="Bia", email="bia@example.com", google_sub="bia", phone="11999999998",
                                   status="approved", role="commercial")
    service.clients.messages, service.clients.push = Mock(), Mock()
    yield service, actor, other
    service.close()


def wait_finished(service, actor, identifier, timeout=10):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        status = service.funnel_imports.status(actor, identifier)
        if status["finished"]:
            return status
        time.sleep(0.02)
    raise AssertionError("batch did not finish")


def test_each_lead_is_its_own_task_with_its_own_notice(runtime):
    service, actor, _ = runtime
    service.clients.create(actor, name="Padaria Antiga", niche="Alimentação")
    leads = [{"title": "Padaria A"}, {"title": "Padaria Antiga"}, {"title": "Padaria C", "phone": "(11) 3333-4444"}]
    snapshot = service.funnel_imports.submit(actor, "Alimentação", leads)
    assert snapshot["total"] == 3 and snapshot["finished"] is False
    status = wait_finished(service, actor, snapshot["id"])
    assert status["items"] == ["created", "duplicate", "created"]
    assert (status["done"], status["created"], status["skipped"], status["failed"]) == (3, 2, 1, 0)
    names = {row["name"] for row in service.clients.list(actor)}
    assert {"Padaria A", "Padaria C"} <= names
    titles = [notice["title"] for notice in service.announcements.list_for_user(actor)]
    assert titles.count("Novo cliente cadastrado") == 3  # the manual client plus one per lead created in the batch


def test_a_failing_lead_does_not_stop_the_others(runtime, monkeypatch):
    service, actor, _ = runtime
    original = service.clients.import_leads

    def flaky(who, niche, leads):
        if leads[0]["title"] == "Quebra":
            raise RuntimeError("boom")
        return original(who, niche, leads)

    monkeypatch.setattr(service.clients, "import_leads", flaky)
    status = wait_finished(service, actor, service.funnel_imports.submit(
        actor, "Alimentação", [{"title": "Boa 1"}, {"title": "Quebra"}, {"title": "Boa 2"}])["id"])
    assert status["items"] == ["created", "failed", "created"] and status["failed"] == 1


def test_one_batch_at_a_time_per_member_and_batches_are_private(runtime, monkeypatch):
    service, actor, other = runtime
    gate = threading.Event()
    original = service.clients.import_leads
    monkeypatch.setattr(service.clients, "import_leads", lambda *args: (gate.wait(5), original(*args))[1])
    first = service.funnel_imports.submit(actor, "Alimentação", [{"title": "Lenta"}])
    with pytest.raises(ResourceConflict):
        service.funnel_imports.submit(actor, "Alimentação", [{"title": "Outra"}])
    assert service.funnel_imports.submit(other, "Alimentação", [{"title": "Da Bia"}])["total"] == 1
    with pytest.raises(ResourceNotFound):
        service.funnel_imports.status(other, first["id"])
    gate.set()
    wait_finished(service, actor, first["id"])
    assert service.funnel_imports.submit(actor, "Alimentação", [{"title": "Agora pode"}])["total"] == 1


def test_batch_size_is_limited(runtime):
    service, actor, _ = runtime
    with pytest.raises(ValueError):
        service.funnel_imports.submit(actor, "Alimentação", [])
    with pytest.raises(ValueError):
        service.funnel_imports.submit(actor, "Alimentação", [{"title": str(n)} for n in range(201)])
