import logging
import os
import secrets
import shutil
import socket
import subprocess
import threading
import time
from pathlib import Path

import httpx

from backend.infra.config.settings import Settings

logger = logging.getLogger(__name__)

START_TIMEOUT_SECONDS = 40
# Where the Docker image records the chrome-headless-shell it installed.
HEADLESS_SHELL_FILE = Path("/opt/browsers/chrome-headless-shell-path")


class EmbeddedVideoServer:
    """The render server (video-server/) run as a child process of the backend, on loopback only.

    It starts on the first video request, with a random secret that only this process knows, and is started
    again if it dies. Rendering is CPU heavy, so it runs with a lower priority than the API.
    """
    def __init__(self, settings: Settings):
        self.directory = settings.video_server_dir
        self.node = shutil.which("node")
        self.work_dir = settings.upload_dir / "video-work"
        self.max_renders = settings.video_max_concurrent_renders
        self._process: subprocess.Popen | None = None
        self._lock = threading.Lock()

    @property
    def installed(self) -> bool:
        return (self.node is not None and (self.directory / "server.mjs").is_file()
                and (self.directory / "node_modules" / "@hyperframes" / "producer").is_dir())

    def alive(self) -> bool:
        return self._process is not None and self._process.poll() is None

    def start(self) -> tuple[str, str]:
        """Make sure the server runs; returns its base URL and secret."""
        with self._lock:
            if not self.alive():
                self._launch()
            return self._url, self._secret

    def _launch(self) -> None:
        self.stop()
        self.work_dir.mkdir(parents=True, exist_ok=True)
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
        self._secret = secrets.token_urlsafe(32)
        self._url = f"http://127.0.0.1:{port}"
        env = {**os.environ, "HOST": "127.0.0.1", "PORT": str(port), "VIDEO_SERVER_SECRET": self._secret,
               "VIDEO_RENDERS_DIR": str(self.work_dir / "renders"),
               "VIDEO_MAX_CONCURRENT_RENDERS": str(self.max_renders), "PRODUCER_DISABLE_HEALTH_WORKER": "1"}
        if "PRODUCER_HEADLESS_SHELL_PATH" not in env and HEADLESS_SHELL_FILE.is_file():
            env["PRODUCER_HEADLESS_SHELL_PATH"] = HEADLESS_SHELL_FILE.read_text().strip()
        log = (self.work_dir / "video-server.log").open("ab")
        try:
            self._process = subprocess.Popen(
                [self.node, "server.mjs"], cwd=self.directory, env=env, stdout=log, stderr=log,
                stdin=subprocess.DEVNULL, preexec_fn=lambda: os.nice(10))
        finally:
            log.close()
        deadline = time.monotonic() + START_TIMEOUT_SECONDS
        while time.monotonic() < deadline:
            if self._process.poll() is not None:
                break
            try:
                if httpx.get(self._url + "/health", timeout=1, trust_env=False).status_code == 200:
                    logger.info("Video server started on %s", self._url)
                    return
            except httpx.HTTPError:
                time.sleep(0.2)
        self.stop()
        raise RuntimeError("The video server did not start; see video-work/video-server.log")

    def stop(self) -> None:
        process, self._process = self._process, None
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
