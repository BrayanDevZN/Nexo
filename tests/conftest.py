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
def settings(tmp_path):
    return Settings(_env_file=None, environment="test", jwt_secret_key="test-only-key-" * 4,
                    database_url="sqlite:///" + str(tmp_path / "nested" / "nexo.db"))


@pytest.fixture
def local_redis_url():
    import os
    from urllib.parse import urlsplit
    url = os.getenv("REDIS_TEST_URL")
    if not url:
        pytest.skip("Set REDIS_TEST_URL to a local test Redis (required in CI)")
    if urlsplit(url).hostname not in {"localhost", "127.0.0.1", "redis"}:
        pytest.fail("Integration tests only allow local Redis hosts")
    return url
