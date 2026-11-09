import pytest
from pydantic import ValidationError

from backend.controller.schema.paid_leads import PaidLeadPatch, PublicClickInput, PublicVisitInput


def test_a_visit_keeps_only_plain_origin_and_click_id():
    visit = PublicVisitInput(page="contabilidade", origin="google-ads", click_id="Cj0KCQ_abc-123")
    assert (visit.origin, visit.click_id) == ("google-ads", "Cj0KCQ_abc-123")
    dropped = PublicVisitInput(page="contabilidade", origin="<script>", click_id="a b;c")
    assert dropped.origin is None and dropped.click_id is None


def test_a_visit_only_accepts_known_pages_and_no_extra_fields():
    with pytest.raises(ValidationError):
        PublicVisitInput(page="other")
    with pytest.raises(ValidationError):
        PublicVisitInput(page="contabilidade", stage="won")


def test_a_click_placement_is_a_plain_token():
    assert PublicClickInput(placement="hero").placement == "hero"
    assert PublicClickInput(placement="<b>x</b>").placement == "unknown"


def test_the_team_can_edit_the_stage_and_contact_fields():
    patch = PaidLeadPatch(stage="qualified", name="  Maria ", phone="(31) 99999-8888", email=" ", notes="  ", contract_value="1500.50")
    assert patch.stage == "qualified" and patch.name == "Maria"
    assert patch.phone == "+5531999998888"
    assert patch.email is None and patch.notes is None
    assert str(patch.contract_value) == "1500.50"
    assert PaidLeadPatch(phone="").phone is None


@pytest.mark.parametrize("data", [{}, {"stage": None}, {"stage": "nonsense"}, {"phone": "abc"}, {"contract_value": -1}, {"source": "x"}])
def test_bad_edits_are_rejected(data):
    with pytest.raises(ValidationError):
        PaidLeadPatch(**data)
