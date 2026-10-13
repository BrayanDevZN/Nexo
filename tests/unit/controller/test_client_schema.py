import pytest
from pydantic import ValidationError

from backend.controller.schema.clients import ClientFields, ClientOutput, ClientPatch


@pytest.mark.parametrize("extra", [{"created_by_id": "other"}, {"id": "forged"}, {"role": "admin"}])
def test_client_cannot_choose_identity_or_creator(extra):
    with pytest.raises(ValidationError):
        ClientFields(name="Client", niche="Varejo", **extra)


@pytest.mark.parametrize("data", [{}, {"name": None}, {"niche": "  "},
                                 {"contract_closed": None}, {"contract_closed": "false"}])
def test_patch_rejects_empty_invalid_or_null_required_fields(data):
    with pytest.raises(ValidationError):
        ClientPatch(**data)


def test_patch_distinguishes_omission_from_clearing_optional_fields():
    patch = ClientPatch(notes=None, email=None)
    assert patch.model_dump(exclude_unset=True) == {"notes": None, "email": None}
    assert ClientFields(name=" Client ", niche=" Varejo ", phone="(11) 99999-9999").phone == "+11999999999"

 
@pytest.mark.parametrize("niche", ["Consultoria aleatória", "", "varejo", "Varejo e qualquer coisa"])
def test_client_rejects_niches_outside_the_supported_list(niche):
    with pytest.raises(ValidationError):
        ClientFields(name="Client", niche=niche)


def test_patch_rejects_niches_outside_the_supported_list():
    with pytest.raises(ValidationError):
        ClientPatch(niche="Nicho inventado")


def test_legacy_niches_remain_readable_in_client_output():
    output = ClientOutput(
        name="Client", niche="Nicho antigo", contract_closed=False,
        contract_value=None, pipeline_stage="lead", next_follow_up=None,
        phone=None, email=None, notes=None, pain=None, approach=None,
        contract_closed_at=None, id="id", created_by_name="Membro",
        created_by_id="member", created_at="2026-10-13T00:00:00Z",
        updated_at="2026-10-13T00:00:00Z",
    )
    assert output.niche == "Nicho antigo"
