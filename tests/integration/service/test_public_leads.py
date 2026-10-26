from unittest.mock import Mock

import pytest
from pydantic import SecretStr

from backend.domain.passwords import PasswordHasher
from backend.service.runtime import RuntimeServices


@pytest.fixture
def runtime(settings, local_redis_url, monkeypatch, tmp_path):
    settings.redis_url = SecretStr(local_redis_url)
    settings.upload_dir = tmp_path / "photos"
    monkeypatch.setattr("backend.service.runtime.PasswordHasher", lambda: PasswordHasher(rounds=4))
    service = RuntimeServices(settings)
    service.initialize(settings)
    service.clients.messages, service.clients.push, service.clients.webhook_events = Mock(), Mock(), Mock()
    with service.repositories.transaction() as repos:
        owner = repos.users.create(name="Dona", email="dona@example.com", google_sub="dona", phone="11999999990",
                                   status="approved", role="owner")
    yield service, owner
    service.close()


def test_a_lead_from_an_ad_lands_in_the_first_paid_stage_with_its_origin(runtime):
    service, owner = runtime
    row = service.clients.create_public_lead(name="Maria Souza", phone="+5531999998888", email="maria@example.com",
                                             page="contabilidade", origin="google-ads", click_id="gclid-123")
    assert (row.pipeline_stage, row.sales_channel, row.niche) == ("lead", "google_ads", "Contabilidade")
    assert row.created_by_id == owner.id
    assert "gclid-123" in row.notes and "google-ads" in row.notes and "/contabilidade" in row.notes
    saved = service.clients.list(owner)
    assert [(client["name"], client["phone"], client["sales_channel"]) for client in saved] == [
        ("Maria Souza", "+5531999998888", "google_ads")]
    titles = [notice["title"] for notice in service.announcements.list_for_user(owner)]
    assert titles == ["Novo lead do site"]
    service.clients.webhook_events.emit.assert_called_once()
    assert service.clients.webhook_events.emit.call_args.args[0] == "newClient"


def test_a_visit_without_a_known_channel_has_no_channel(runtime):
    service, owner = runtime
    row = service.clients.create_public_lead(name="Sem Origem", phone="+5531988887777", email=None, page="contabilidade")
    assert row.sales_channel is None


def test_the_same_phone_is_not_saved_twice(runtime):
    service, owner = runtime
    first = service.clients.create_public_lead(name="Maria", phone="+5531999998888", email=None, page="contabilidade")
    again = service.clients.create_public_lead(name="Maria Souza", phone="+5531999998888", email=None, page="contabilidade")
    assert first is not None and again is None
    assert len(service.clients.list(owner)) == 1


def test_without_an_owner_account_the_lead_is_refused(settings, local_redis_url, monkeypatch, tmp_path):
    settings.redis_url = SecretStr(local_redis_url)
    settings.upload_dir = tmp_path / "photos"
    monkeypatch.setattr("backend.service.runtime.PasswordHasher", lambda: PasswordHasher(rounds=4))
    service = RuntimeServices(settings)
    service.initialize(settings)
    try:
        with service.repositories.transaction() as repos:
            owners = [user for user in repos.users.list(limit=100) if user.role == "owner"]
        if owners:
            pytest.skip("initialization already creates an owner")
        with pytest.raises(LookupError):
            service.clients.create_public_lead(name="Maria", phone="+5531999998888", email=None, page="contabilidade")
    finally:
        service.close()
