import pytest
from pydantic import ValidationError

from backend.controller.schema.auth import RegistrationInput
from backend.domain.csrf import CSRFService


def test_registration_normalizes_name_and_phone():
    data = RegistrationInput(name=" Ana ", phone="+55 (11) 99999-9999",
                             email="ana@example.com", password="strong-password-123")
    assert data.name == "Ana"
    assert data.phone == "+5511999999999"
    assert "strong-password" not in repr(data)


@pytest.mark.parametrize("extra", [{"role": "admin"}, {"status": "approved"},
                                   {"session_version": 9}, {"password_hash": "fake"}])
def test_registration_refuses_privilege_fields(extra):
    with pytest.raises(ValidationError):
        RegistrationInput(name="Ana", phone="11999999999", email="ana@example.com",
                          password="strong-password-123", **extra)


@pytest.mark.parametrize("password", ["short", "é" * 37])
def test_registration_enforces_bcrypt_byte_limit(password):
    with pytest.raises(ValidationError):
        RegistrationInput(name="Ana", phone="11999999999", email="ana@example.com",
                          password=password)


def test_csrf_is_bound_to_session_and_key():
    csrf = CSRFService("a" * 32)
    token = csrf.create("session-one")
    assert csrf.verify("session-one", token)
    assert not csrf.verify("session-two", token)
    assert not CSRFService("b" * 32).verify("session-one", token)
    assert not csrf.verify("session-one", "é")
