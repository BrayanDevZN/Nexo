import pytest
from pydantic import ValidationError

from backend.controller.schema.clients import ClientCreate, ClientFields, ClientOutput, ClientPatch


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


@pytest.mark.parametrize("channel", ["email", "whatsapp", "instagram", "phone", "in_person", "other", None])
def test_sales_channel_is_optional_and_limited_to_the_supported_list(channel):
    assert ClientFields(name="Client", niche="Varejo", sales_channel=channel).sales_channel == channel
    assert ClientFields(name="Client", niche="Varejo").sales_channel is None


@pytest.mark.parametrize("channel", ["E-mail", "Email", "telegram", "", " email", "whatsapp,email"])
def test_sales_channel_rejects_values_outside_the_supported_list(channel):
    with pytest.raises(ValidationError):
        ClientFields(name="Client", niche="Varejo", sales_channel=channel)
    with pytest.raises(ValidationError):
        ClientPatch(sales_channel=channel)


def test_patch_can_clear_the_sales_channel_without_touching_other_fields():
    assert ClientPatch(sales_channel=None).model_dump(exclude_unset=True) == {"sales_channel": None}
    assert ClientPatch(sales_channel="email").model_dump(exclude_unset=True) == {"sales_channel": "email"}


def test_instagram_and_website_are_normalized_to_links():
    created = ClientCreate(name="X", niche="Varejo", instagram="@padaria.sp", website="padaria.com.br")
    assert created.instagram == "https://www.instagram.com/padaria.sp" and created.website == "https://padaria.com.br"
    assert ClientCreate(name="X", niche="Varejo", instagram="instagram.com/padaria").instagram == "https://instagram.com/padaria"
    assert ClientCreate(name="X", niche="Varejo", instagram="  ", website="").website is None


@pytest.mark.parametrize("field,value", [("instagram", "https://facebook.com/padaria"), ("instagram", "dois nomes"), ("website", "sem ponto")])
def test_invalid_links_are_rejected(field, value):
    with pytest.raises(ValidationError):
        ClientCreate(name="X", niche="Varejo", **{field: value})
