import pytest
from pydantic import ValidationError

from backend.controller.schema.passwords import RecoveryConfirmInput


@pytest.mark.parametrize("code,password", [("123", "valid-password-123"),
                                          ("１２３４５６７８", "valid-password-123"),
                                          ("12345678", "short"), ("12345678", "é" * 37)])
def test_password_reset_rejects_bad_code_and_bcrypt_policy(code, password):
    with pytest.raises(ValidationError):
        RecoveryConfirmInput(email="ana@example.com", code=code, new_password=password)


def test_password_reset_model_masks_both_secrets():
    data = RecoveryConfirmInput(email="ana@example.com", code="12345678", new_password="valid-password-123")
    assert "12345678" not in repr(data) and "valid-password-123" not in repr(data)
