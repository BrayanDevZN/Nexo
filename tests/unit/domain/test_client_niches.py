import pytest

from backend.domain.client_niches import CLIENT_NICHES, validate_client_niche


def test_barbearia_is_a_niche_of_its_own_right_after_beleza_e_estetica():
    assert validate_client_niche("Barbearia") == "Barbearia"
    assert CLIENT_NICHES.index("Barbearia") == CLIENT_NICHES.index("Beleza e estética") + 1
    with pytest.raises(ValueError):
        validate_client_niche("Barbeiro")
