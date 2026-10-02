import os
import subprocess
import sys
from pathlib import Path

from fastapi.testclient import TestClient

from backend.controller.application import create_app

ROOT = Path(__file__).resolve().parents[3]


def test_health_and_unknown_route(settings):
    with TestClient(create_app(settings)) as client:
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok", "service": "nexo-backend"}
        assert client.get("/clients").status_code == 401
        assert client.get("/unknown-route").status_code == 404


def test_cors_accepts_configured_origin_and_rejects_unknown(settings):
    with TestClient(create_app(settings)) as client:
        headers = {"Origin": "http://localhost:5173",
                   "Access-Control-Request-Method": "POST"}
        response = client.options("/health", headers=headers)
        assert response.status_code == 200
        assert response.headers["access-control-allow-credentials"] == "true"
        headers["Origin"] = "https://untrusted.example"
        response = client.options("/health", headers=headers)
        assert response.status_code == 400
        assert "access-control-allow-origin" not in response.headers


def test_cli_reports_missing_configuration_without_leaking_secrets(tmp_path):
    # Execute a clean interpreter; disable the real dotenv explicitly.
    script = "from backend.infra.config.settings import Settings; Settings.model_config['env_file']=None; from backend.main import main; main()"
    env = dict(os.environ, PYTHONPATH=str(ROOT / "src"), PASSWORD="secret-sentinel")
    result = subprocess.run([sys.executable, "-c", script, "--check-config"],
                            env=env, cwd=tmp_path, capture_output=True, text=True)
    assert result.returncode == 1
    assert "jwt_secret_key" in result.stderr
    assert "secret-sentinel" not in result.stderr + result.stdout


def test_cli_configuration_check(tmp_path):
    script = "from backend.infra.config.settings import Settings; Settings.model_config['env_file']=None; from backend.main import main; main()"
    env = dict(os.environ, PYTHONPATH=str(ROOT / "src"), JWT_SECRET_KEY="test-cli-key-" * 4)
    result = subprocess.run([sys.executable, "-c", script, "--check-config"],
                            env=env, cwd=tmp_path, capture_output=True, text=True)
    assert result.returncode == 0
    assert "configuration valid" in result.stdout
