from unittest.mock import Mock

from backend.main import main


def test_server_receives_trusted_proxy_configuration(settings, monkeypatch):
    settings.forwarded_allow_ips = "127.0.0.1,10.0.0.0/8"
    application = object()
    run = Mock()
    monkeypatch.setattr("backend.main.get_settings", lambda: settings)
    monkeypatch.setattr("backend.main.create_app", lambda config: application)
    monkeypatch.setattr("backend.main.uvicorn.run", run)
    monkeypatch.setattr("sys.argv", ["nexo"])
    main()
    run.assert_called_once_with(application, host=settings.host, port=settings.port,
                                forwarded_allow_ips="127.0.0.1,10.0.0.0/8")
