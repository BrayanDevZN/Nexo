from backend.infra.config.settings import Settings


def test_same_environment_credentials_create_admin_and_configure_sender(tmp_path, monkeypatch):
    from unittest.mock import Mock

    from backend.domain.passwords import PasswordHasher
    from backend.infra.connections.database import DatabaseConnection
    from backend.infra.connections.email import GmailConnection
    from backend.repository.db.control.manager import RepositoryManager
    from backend.repository.db.schema import create_tables
    from backend.service.auth import AuthService

    monkeypatch.setenv("EMAIL", "owner@example.com")
    monkeypatch.setenv("PASSWORD", "shared-application-password")
    settings = Settings(_env_file=None, jwt_secret_key="test-env-key-" * 4,
                        database_url="sqlite:///" + str(tmp_path / "admin.db"))
    database = DatabaseConnection(settings)
    sender = GmailConnection(settings)
    try:
        create_tables(database.engine)
        auth = AuthService(RepositoryManager(database), PasswordHasher(rounds=4), Mock())
        auth.bootstrap_admin(settings)
        user, _ = auth.login("owner@example.com", "shared-application-password")
        assert user.role == "admin" and user.status == "approved"
        assert user.google_sub is None
        assert sender.configured
        smtp = Mock()
        constructor = Mock(return_value=smtp)
        monkeypatch.setattr("backend.infra.connections.email.yagmail.SMTP", constructor)
        sender.send("recipient@example.com", "Test", "Test body").result(timeout=2)
        assert constructor.call_args.kwargs["user"] == "owner@example.com"
        assert constructor.call_args.kwargs["password"] == "shared-application-password"
    finally:
        sender.close()
        database.close()


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
