import pytest

from backend.infra.config.settings import Settings, get_settings


@pytest.fixture(autouse=True)
def isolated_environment(monkeypatch):
    # Tests never read real credentials or depend on the developer's environment.
    for key in Settings.model_fields:
        monkeypatch.delenv(key.upper(), raising=False)
    monkeypatch.setitem(Settings.model_config, "env_file", None)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def settings():
    return Settings(_env_file=None, environment="test", jwt_secret_key="test-only-key-" * 4)
