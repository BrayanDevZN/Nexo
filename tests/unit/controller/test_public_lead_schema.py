import pytest
from pydantic import ValidationError

from backend.controller.schema.leads import PublicLeadInput

VALID = {"name": "  Maria   Souza ", "phone": "(31) 99999-8888", "page": "contabilidade", "consent": True}


def test_a_valid_lead_is_cleaned():
    lead = PublicLeadInput(**VALID, email="  ", origin="google-ads", click_id="Cj0KCQ_abc-123")
    assert lead.name == "Maria Souza"
    assert lead.phone == "+5531999998888"
    assert lead.email is None
    assert (lead.origin, lead.click_id) == ("google-ads", "Cj0KCQ_abc-123")


def test_consent_is_required_and_must_be_true():
    for consent in (False, None, "yes"):
        with pytest.raises(ValidationError):
            PublicLeadInput(**{**VALID, "consent": consent})
    with pytest.raises(ValidationError):
        PublicLeadInput(**{key: value for key, value in VALID.items() if key != "consent"})


@pytest.mark.parametrize("phone", ["", "abc", "123", "11 9999-88x8", "+" + "1" * 16])
def test_bad_phones_are_rejected(phone):
    with pytest.raises(ValidationError):
        PublicLeadInput(**{**VALID, "phone": phone})


def test_only_known_pages_and_no_extra_fields_are_accepted():
    with pytest.raises(ValidationError):
        PublicLeadInput(**{**VALID, "page": "other"})
    with pytest.raises(ValidationError):
        PublicLeadInput(**VALID, created_by_id="someone")
    with pytest.raises(ValidationError):
        PublicLeadInput(**{**VALID, "name": " a "})


def test_a_malformed_origin_or_click_id_is_dropped_not_stored():
    lead = PublicLeadInput(**VALID, origin="<script>", click_id="a b;c")
    assert lead.origin is None and lead.click_id is None
