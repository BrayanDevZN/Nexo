from backend.infra.config.settings import Settings


def test_environment_overrides_dotenv(tmp_path, monkeypatch):
    dotenv = tmp_path / ".env"
    dotenv.write_text('JWT_SECRET_KEY=' + 'file-key-' * 8 + '\nRATE_LIMIT=7\n'
                       'CORS_ORIGINS=["http://localhost:5173"]\n')
    monkeypatch.setenv("RATE_LIMIT", "19")
    settings = Settings(_env_file=dotenv)
    assert settings.rate_limit == 19
    assert settings.jwt_secret_key.get_secret_value() == "file-key-" * 8
    assert settings.cors_origins == ["http://localhost:5173"]


def test_settings_loaded_into_application(settings):
    from backend.controller.application import create_app
    app = create_app(settings)
    assert app.state.settings is settings


def test_proxy_setting_from_dotenv_and_environment(tmp_path, monkeypatch):
    dotenv = tmp_path / ".env"
    dotenv.write_text("JWT_SECRET_KEY=" + "file-key-" * 8
                      + "\nFORWARDED_ALLOW_IPS=127.0.0.1,10.0.0.0/8\n")
    assert Settings(_env_file=dotenv).forwarded_allow_ips == "127.0.0.1,10.0.0.0/8"
    monkeypatch.setenv("FORWARDED_ALLOW_IPS", "")
    assert Settings(_env_file=dotenv).forwarded_allow_ips == ""
