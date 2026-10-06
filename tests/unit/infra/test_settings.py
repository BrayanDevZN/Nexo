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
                  email="admin@example.com", password="long-admin-password",
                  frontend_url="https://example.com", cors_origins=["https://example.com"])
    assert config(**values).environment == "production"
    values["cookie_secure"] = False
    with pytest.raises(ValidationError):
        config(**values)


def test_blank_optional_credentials_are_supported():
    assert config(email="", password="").email is None


@pytest.mark.parametrize("value", [
    "https://*.example.com", "https://user:secret@example.com",
    "https://example.com:0", "https://example.com:99999",
    "https://example.com:bad", "https://[broken",
    "https://example.com?next=evil", "https://example.com#fragment",
    "https://exam ple.com", "https://example.com/\npath",
])
@pytest.mark.parametrize("field", ["frontend_url", "google_redirect_uri", "cors_origins"])
def test_rejects_unsafe_http_addresses(field, value):
    with pytest.raises(ValidationError):
        config(**{field: [value] if field == "cors_origins" else value})


@pytest.mark.parametrize("name", ["", "a b", "a=b", "a;bad", "nexo_google_flow", "nexo_google_profile"])
def test_rejects_invalid_or_oauth_cookie_names(name):
    with pytest.raises(ValidationError):
        config(auth_cookie_name=name)


@pytest.mark.parametrize("prefix", ["__Host-", "__Secure-"])
def test_cookie_prefix_requires_secure(prefix):
    with pytest.raises(ValidationError):
        config(auth_cookie_name=prefix + "session")
    assert config(auth_cookie_name=prefix + "session", cookie_secure=True).cookie_secure


@pytest.mark.parametrize("password", ["a" * 73, "é" * 37, "short"])
def test_password_matches_bcrypt_limits(password):
    with pytest.raises(ValidationError):
        config(email="admin@example.com", password=password)


def test_admin_name_and_legitimate_urls():
    assert config(admin_name="  Brayan  ").admin_name == "Brayan"
    assert config(frontend_url="https://example.com/panel/").frontend_url == "https://example.com/panel"
    assert config(cors_origins=["https://example.com:8443/"]).cors_origins == ["https://example.com:8443"]
    for name in ["   ", "a" * 121]:
        with pytest.raises(ValidationError):
            config(admin_name=name)
