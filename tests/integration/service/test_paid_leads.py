import pytest
from pydantic import SecretStr

from backend.domain.passwords import PasswordHasher
from backend.service.access import AccessDenied, ResourceNotFound
from backend.service.runtime import RuntimeServices


@pytest.fixture
def runtime(settings, local_redis_url, monkeypatch, tmp_path):
    settings.redis_url = SecretStr(local_redis_url)
    settings.upload_dir = tmp_path / "photos"
    monkeypatch.setattr("backend.service.runtime.PasswordHasher", lambda: PasswordHasher(rounds=4))
    service = RuntimeServices(settings)
    service.initialize(settings)
    with service.repositories.transaction() as repos:
        sales = repos.users.create(name="Ana", email="ana@example.com", google_sub="ana", phone="11999999999",
                                   status="approved", role="commercial")
        dev = repos.users.create(name="Dev", email="dev@example.com", google_sub="dev", phone="11999999998",
                                 status="approved", role="dev")
    yield service, sales, dev
    service.close()


def test_only_ad_traffic_is_recorded_and_a_reload_does_not_duplicate_it(runtime):
    service, sales, _ = runtime
    assert service.paid_leads.record_visit(page="contabilidade", source=None) is None
    assert service.paid_leads.record_visit(page="contabilidade", source="instagram", click_id="x") is None
    first = service.paid_leads.record_visit(page="contabilidade", source="google-ads", click_id="gclid-1")
    again = service.paid_leads.record_visit(page="contabilidade", source="google-ads", click_id="gclid-1")
    other = service.paid_leads.record_visit(page="contabilidade", source="google-ads", click_id="gclid-2")
    assert first == again and first != other
    rows = service.paid_leads.list(sales)
    assert {row.click_id for row in rows} == {"gclid-1", "gclid-2"}
    assert all(row.stage == "visited" and row.source == "google-ads" for row in rows)


def test_the_whatsapp_click_moves_the_lead_once_and_never_backwards(runtime):
    service, sales, _ = runtime
    lead_id = service.paid_leads.record_visit(page="contabilidade", source="google-ads", click_id="gclid-1")
    service.paid_leads.record_whatsapp_click(lead_id, "hero")
    row = service.paid_leads.list(sales)[0]
    assert (row.stage, row.placement) == ("whatsapp_click", "hero") and row.whatsapp_clicked_at is not None
    service.paid_leads.update(sales, lead_id, stage="qualified")
    service.paid_leads.record_whatsapp_click(lead_id, "footer")
    row = service.paid_leads.list(sales)[0]
    assert (row.stage, row.placement) == ("qualified", "hero")
    service.paid_leads.record_whatsapp_click("00000000-0000-0000-0000-000000000000", "hero")  # unknown id: silently ignored


def test_the_commercial_team_edits_filters_and_deletes_and_others_cannot(runtime):
    service, sales, dev = runtime
    one = service.paid_leads.record_visit(page="contabilidade", source="google-ads", click_id="a")
    two = service.paid_leads.record_visit(page="contabilidade", source="google-ads", click_id="b")
    service.paid_leads.update(sales, one, stage="won", name="Maria", phone="+5531999998888", contract_value=900)
    assert [row.id for row in service.paid_leads.list(sales, stage="won")] == [one]
    assert service.paid_leads.list(sales, stage="visited")[0].id == two
    with pytest.raises(AccessDenied):
        service.paid_leads.list(dev)
    with pytest.raises(AccessDenied):
        service.paid_leads.update(dev, one, stage="lost")
    with pytest.raises(ResourceNotFound):
        service.paid_leads.update(sales, "missing", stage="lost")
    service.paid_leads.delete(sales, two)
    with pytest.raises(ResourceNotFound):
        service.paid_leads.delete(sales, two)
    assert [row.id for row in service.paid_leads.list(sales)] == [one]
