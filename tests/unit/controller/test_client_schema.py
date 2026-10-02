import pytest
from pydantic import ValidationError

from backend.controller.schema.clients import ClientFields, ClientPatch


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
