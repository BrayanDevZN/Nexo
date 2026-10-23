from unittest.mock import Mock

import pytest
from pydantic import SecretStr

from backend.domain.passwords import PasswordHasher
from backend.service.runtime import RuntimeServices

ROLES = ("owner", "admin", "dev", "commercial")


@pytest.fixture
def runtime(settings, local_redis_url, monkeypatch, tmp_path):
    settings.redis_url = SecretStr(local_redis_url)
    settings.upload_dir = tmp_path / "photos"
    monkeypatch.setattr("backend.service.runtime.PasswordHasher", lambda: PasswordHasher(rounds=4))
    service = RuntimeServices(settings)
    service.initialize(settings)
    people = {}
    with service.repositories.transaction() as repos:
        for role in ROLES:
            people[role] = repos.users.create(name=role.title(), email=role + "@example.com", google_sub=role,
                                              phone="11999999999", status="approved", role=role)
        repos.users.create(name="Pending", email="pending@example.com", google_sub="pending",
                           phone="11999999999", status="pending", role="commercial")
    service.announcements.messages = Mock()
    service.announcements.push = Mock()
    service.clients.messages = Mock()
    service.clients.push = Mock()
    yield service, people
    service.close()


def who_got(service, people, title):
    return {role for role, user in people.items()
            if any(notice["title"] == title for notice in service.announcements.list_for_user(user))}


@pytest.mark.parametrize(("audience", "expected"), [
    ("all", {"owner", "admin", "dev", "commercial"}),
    ("commercial", {"owner", "admin", "commercial"}),
    ("dev", {"owner", "admin", "dev"}),
])
def test_announcement_reaches_its_audience_plus_admins_and_owners(runtime, audience, expected):
    service, people = runtime
    result = service.announcements.create(people["owner"], title="Aviso " + audience, body="Texto", audience=audience)
    assert who_got(service, people, "Aviso " + audience) == expected
    assert result["recipients"] == len(expected) and result["audience"] == audience
    emailed = {call.args[0].email for call in service.announcements.messages.announcement.call_args_list}
    assert emailed == {role + "@example.com" for role in expected}
    pushed = set(service.announcements.push.notify_users.call_args.args[0])
    assert pushed == {people[role].id for role in expected}
    stored = [n for n in service.announcements.list_for_user(people["owner"]) if n["title"] == "Aviso " + audience]
    assert stored[0]["audience"] == audience


def test_an_unknown_audience_is_refused(runtime):
    service, people = runtime
    with pytest.raises(ValueError):
        service.announcements.create(people["owner"], title="x", body="y", audience="everyone")


def test_client_events_only_notify_the_commercial_team_and_admins(runtime):
    service, people = runtime
    service.clients.create(people["commercial"], name="Padaria", niche="Alimentação")
    assert who_got(service, people, "Novo cliente cadastrado") == {"owner", "admin", "commercial"}
    emailed = {call.args[0].email for call in service.clients.messages.announcement.call_args_list}
    assert "dev@example.com" not in emailed and "commercial@example.com" in emailed and "owner@example.com" in emailed


def test_automation_events_only_notify_developers_and_admins(runtime, tmp_path):
    service, people = runtime
    service.automations.push = Mock()
    service.automations.create(people["dev"], name="Fluxo X", description="Faz algo", filename="x.json", file_content=b"{}")
    assert who_got(service, people, "Nova automação disponível: Fluxo X") == {"owner", "admin", "dev"}
    assert set(service.automations.push.notify_users.call_args.args[0]) == {people[r].id for r in ("owner", "admin", "dev")}
