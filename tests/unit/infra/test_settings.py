import pytest
from pydantic import ValidationError

from backend.infra.config.settings import Settings

KEY = "test-only-key-" * 4


def config(**values):
    return Settings(_env_file=None, jwt_secret_key=KEY, **values)


@pytest.mark.parametrize("field,value", [
    ("rate_limit", 0), ("global_rate_limit", -1), ("rate_limit_window_seconds", 0),
    ("cache_ttl_seconds", 0), ("email_max_workers", 0), ("email_code_max_attempts", 21),
    ("redis_url", "https://localhost"), ("database_url", "sqlite:///"),
    ("cors_origins", ["*"]), ("cors_origins", ["https://example.com/path"]),
    ("jwt_algorithm", "none"),
])
def test_rejects_invalid_values(field, value):
    with pytest.raises(ValidationError):
        config(**{field: value})


def test_jwt_key_is_required_and_must_be_strong():
    for key in [None, "short"]:
        with pytest.raises(ValidationError):
            Settings(_env_file=None, **({} if key is None else {"jwt_secret_key": key}))


def test_cookie_none_requires_secure():
    with pytest.raises(ValidationError):
        config(cookie_samesite="none")


def test_credential_pair_is_required():
    with pytest.raises(ValidationError):
        config(google_client_id="client")


def test_secret_values_are_not_exposed_in_repr():
    settings = config(email="sender@example.com", password="smtp-secret-sentinel")
    assert KEY not in repr(settings)
    assert "smtp-secret-sentinel" not in repr(settings)


def test_production_configuration():
    values = dict(environment="production", cookie_secure=True,
                  admin_email="admin@example.com", admin_password="long-admin-password",
                  frontend_url="https://example.com", cors_origins=["https://example.com"])
    assert config(**values).environment == "production"
    values["cookie_secure"] = False
    with pytest.raises(ValidationError):
        config(**values)


def test_blank_optional_credentials_are_supported():
    assert config(admin_email="", admin_password="").admin_email is None
