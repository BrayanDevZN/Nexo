from fastapi.testclient import TestClient
from pydantic import SecretStr

from backend.controller.application import create_app


def test_readiness_and_resource_lifecycle(settings, local_redis_url):
    settings.redis_url = SecretStr(local_redis_url)
    app = create_app(settings)
    with TestClient(app) as client:
        response = client.get("/health/ready")
        assert response.status_code == 200
        assert response.json() == {"status": "ready", "checks": {"database": True, "redis": True}}
        runtime = app.state.services
        assert runtime.database.ping()
    assert runtime.email._closed


def test_readiness_failure_exposes_no_credentials(settings):
    settings.redis_url = SecretStr("redis://secret-sentinel@127.0.0.1:1/0")
    with TestClient(create_app(settings)) as client:
        response = client.get("/health/ready")
        assert response.status_code == 503
        assert response.json()["checks"]["redis"] is False
        assert "secret-sentinel" not in response.text
        assert client.get("/health").status_code == 200
