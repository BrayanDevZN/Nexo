from io import BytesIO
from unittest.mock import Mock
from uuid import uuid4

import pytest
from PIL import Image
from pydantic import SecretStr

from backend.domain.passwords import PasswordHasher
from backend.service.access import AccessDenied, ResourceConflict, ResourceNotFound
from backend.service.runtime import RuntimeServices


@pytest.fixture
def runtime(settings, local_redis_url, monkeypatch, tmp_path):
    settings.redis_url = SecretStr(local_redis_url)
    settings.upload_dir = tmp_path / "photos"
    monkeypatch.setattr("backend.service.runtime.PasswordHasher", lambda: PasswordHasher(rounds=4))
    service = RuntimeServices(settings)
    service.initialize(settings)
    with service.repositories.transaction() as repos:
        actor = repos.users.create(name="Member", email="member@example.com", google_sub="member-google",
                                   phone="11999999999", status="approved")
    yield service, actor
    service.close()


def png():
    output = BytesIO()
    Image.new("RGB", (40, 40), "red").save(output, "PNG")
    return output.getvalue()


def test_client_queries_invalidate_after_mutations_and_recheck_permissions(runtime):
    service, actor = runtime
    assert service.clients.list(actor) == []
    service.clients.messages = Mock()
    key = str(uuid4())
    row = service.clients.create(actor, idempotency_key=key, name="Client", niche="Varejo",
                                pain="Baixa geração de leads", approach="Contato consultivo por telefone")
    retry = service.clients.create(actor, idempotency_key=key, name="Client", niche="Varejo",
                                   pain="Baixa geração de leads", approach="Contato consultivo por telefone")
    assert retry.id == row.id
    assert len(service.clients.list(actor)) == 1
    assert service.clients.list(actor, contract_closed=False)[0]["id"] == row.id
    service.clients.update(actor, row.id, contract_closed=True)
    assert service.clients.list(actor, contract_closed=False) == []
    assert service.clients.get(actor, row.id)["contract_closed"] is True
    saved = service.clients.get(actor, row.id)
    assert saved["contract_closed_at"] is not None
    assert saved["pain"] == "Baixa geração de leads"
    assert saved["approach"] == "Contato consultivo por telefone"
    service.clients.update(actor, row.id, pain="Poucos clientes", approach="Agendar uma demonstração")
    updated = service.clients.get(actor, row.id)
    assert updated["pain"] == "Poucos clientes"
    assert updated["approach"] == "Agendar uma demonstração"
    service.clients.update(actor, row.id, contract_closed=False)
    cancelled = service.clients.get(actor, row.id)
    assert cancelled["contract_closed"] is False
    assert cancelled["contract_closed_at"] is None
    assert cancelled["pipeline_stage"] == "lost"
    titles = [notice["title"] for notice in service.announcements.list_for_user(actor)]
    assert titles.count("Novo cliente cadastrado") == 1
    assert "Contrato fechado" in titles
    assert "Contrato cancelado" in titles
    assert service.clients.messages.announcement.call_count >= 3
    with service.repositories.transaction() as repos:
        repos.users.set_status(repos.users.get(actor.id), "pending")
    with pytest.raises(AccessDenied):
        service.clients.get(actor, row.id)
    with service.repositories.transaction() as repos:
        actor = repos.users.get(actor.id)
        repos.users.set_status(actor, "approved")
    service.clients.delete(actor, row.id)
    assert service.clients.list(actor) == []
    with pytest.raises(ResourceNotFound):
        service.clients.get(actor, row.id)


def test_maps_leads_become_funnel_clients_without_duplicates(runtime):
    service, actor = runtime
    service.clients.messages = Mock()
    leads = [
        {"title": "Padaria A", "address": "Rua A, 1", "phone": "(11) 3333-4444", "emails": "x, oi@padaria.com",
         "category": "Padaria", "website": "https://a.example", "review_rating": 4.5, "review_count": 10,
         "link": "https://maps.example/a", "latitude": -23.5, "longitude": -46.6},
        {"title": "Padaria B", "phone": "123"},
        {"title": "padaria a"},
        {"title": "Outra", "phone": "+55 11 3333-4444"},
    ]
    result = service.clients.import_leads(actor, "Alimentação", leads)
    assert result == {"created": 2, "skipped": 2, "items": ["created", "created", "duplicate", "duplicate"]}
    rows = {row["name"]: row for row in service.clients.list(actor)}
    first = rows["Padaria A"]
    assert first["pipeline_stage"] == "lead" and first["niche"] == "Alimentação"
    assert first["phone"] == "+551133334444" and first["email"] == "oi@padaria.com"
    assert first["address"] == "Rua A, 1" and "Google Maps" in first["notes"]
    assert rows["Padaria B"]["phone"] is None
    again = service.clients.import_leads(actor, "Alimentação", leads[:2])
    assert again["created"] == 0 and again["skipped"] == 2
    titles = [notice["title"] for notice in service.announcements.list_for_user(actor)]
    assert titles.count("Novos leads no funil") == 1


def test_photo_replacement_deletion_and_sql_failure_preserve_previous(runtime, monkeypatch):
    service, actor = runtime
    user = service.profiles.upload(actor, png())
    original = user.profile_photo
    assert service.profiles.read_photo(actor).startswith(b"\xff\xd8")
    with monkeypatch.context() as patch:
        patch.setattr("backend.repository.db.control.users.UserRepository.set_photo_if_current",
                      Mock(side_effect=RuntimeError("synthetic sql error")))
        with pytest.raises(RuntimeError):
            service.profiles.upload(actor, png())
        assert [p.name for p in service.profiles.storage.root.iterdir()] == [original]
    updated = service.profiles.upload(actor, png())
    assert updated.profile_photo != original
    assert not (service.profiles.storage.root / original).exists()
    service.profiles.delete_photo(actor)
    assert list(service.profiles.storage.root.iterdir()) == []
    with pytest.raises(ResourceNotFound):
        service.profiles.read_photo(actor)


def test_concurrent_photo_change_rejects_stale_filename(runtime):
    service, actor = runtime
    first = service.profiles.upload(actor, png()).profile_photo
    second = service.profiles.upload(actor, png()).profile_photo
    with service.repositories.transaction() as repos:
        user = repos.users.get(actor.id)
        assert not repos.users.set_photo_if_current(user, previous=first, photo=None)
        assert user.profile_photo == second


def test_failed_photo_compare_and_swap_cleans_new_file(runtime, monkeypatch):
    service, actor = runtime
    monkeypatch.setattr("backend.repository.db.control.users.UserRepository.set_photo_if_current",
                        Mock(return_value=False))
    with pytest.raises(ResourceConflict):
        service.profiles.upload(actor, png())
    assert list(service.profiles.storage.root.iterdir()) == []
