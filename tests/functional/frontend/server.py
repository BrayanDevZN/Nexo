"""Ephemeral API for browser tests. Never reads the developer dotenv."""
import os
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

import uvicorn

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "src"))
from backend.controller.application import create_app  # noqa: E402
from backend.infra.config.settings import Settings  # noqa: E402

if __name__ == "__main__":
    with TemporaryDirectory(prefix="nexo-browser-") as directory:
        settings = Settings(
            _env_file=None, environment="test",
            jwt_secret_key="browser-test-key-" * 4,
            database_url="sqlite:///" + directory + "/nexo.db",
            upload_dir=Path(directory) / "uploads",
            redis_url=os.environ["REDIS_TEST_URL"],
            email="owner@example.com", password="initial-admin-password",
            frontend_url="http://127.0.0.1:4173", cors_origins=["http://127.0.0.1:4173"],
            auth_rate_limit=100,
        )
        uvicorn.run(create_app(settings), host="127.0.0.1", port=8000, access_log=False)
