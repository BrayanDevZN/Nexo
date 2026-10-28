import base64
import logging
import re
import threading
from pathlib import Path

import httpx

from backend.infra.config.settings import Settings
from backend.infra.connections.video_server import EmbeddedVideoServer

logger = logging.getLogger(__name__)


class VideoUnavailable(Exception):
    pass


class VideoRenderFailed(Exception):
    """The render server understood the request but could not make the video; the message is safe to show."""


class VideoConnection:
    """HTTP client for the video server (HyperFrames producer behind a shared secret).

    The server is either external (VIDEO_URL + VIDEO_SECRET) or the one the backend runs itself as a child
    process (the default, see EmbeddedVideoServer); the embedded one starts on the first request.
    """
    def __init__(self, settings: Settings, transport: httpx.BaseTransport | None = None):
        self._timeout, self._transport = settings.video_timeout_seconds, transport
        self._client = None
        self._embedded = None
        self._lock = threading.Lock()
        if settings.video_url and settings.video_secret:
            self._client = self._build(settings.video_url.rstrip("/"), settings.video_secret.get_secret_value())
        elif settings.video_embedded:
            embedded = EmbeddedVideoServer(settings)
            if embedded.installed:
                self._embedded = embedded

    def _build(self, url: str, secret: str) -> httpx.Client:
        return httpx.Client(base_url=url, timeout=self._timeout, trust_env=False, transport=self._transport,
                            headers={"Authorization": f"Bearer {secret}"})

    @property
    def available(self) -> bool:
        return self._client is not None or self._embedded is not None

    def _http(self) -> httpx.Client:
        if self._embedded is None or (self._client is not None and self._embedded.alive()):
            return self._client
        with self._lock:
            if self._client is None or not self._embedded.alive():
                if self._client is not None:
                    self._client.close()
                try:
                    url, secret = self._embedded.start()
                except RuntimeError:
                    logger.exception("The embedded video server could not start")
                    raise VideoUnavailable("Video server could not start") from None
                self._client = self._build(url, secret)
            return self._client

    def _send(self, method: str, path: str, **kwargs) -> httpx.Response:
        try:
            response = self._http().request(method, path, **kwargs)
        except httpx.HTTPError:
            raise VideoUnavailable("Video server unreachable") from None
        if response.status_code in {401, 403} or response.status_code >= 502:
            raise VideoUnavailable("Video server unavailable")
        return response

    def lint(self, html: str) -> list[str]:
        """Problems the render would hit (errors only), so a bad composition is fixed before the slow render."""
        response = self._send("POST", "/lint", json={"html": html})
        if response.status_code != 200:
            return []
        result = response.json().get("result") or {}
        return [f"{item.get('code', 'error')}: {item.get('message', '')}".strip()
                for item in result.get("findings", []) if item.get("severity") == "error"][:10]

    def render(self, html: str, *, fps: int, quality: str, assets: dict[str, bytes] | None = None) -> dict:
        """Render and wait; returns {file, fileSize, videoDurationSeconds}. assets are files the HTML uses."""
        body = {"html": html, "fps": fps, "quality": quality}
        if assets:
            body["assets"] = {name: base64.b64encode(data).decode() for name, data in assets.items()}
        response = self._send("POST", "/render", json=body)
        data = response.json() if response.content else {}
        if response.status_code != 200 or not data.get("success"):
            raise VideoRenderFailed(str(data.get("error") or "Render failed")[:500])
        return data

    def download(self, file: str, destination: Path) -> int:
        """Stream the rendered MP4 into destination; returns its size in bytes."""
        if not re.fullmatch(r"[A-Za-z0-9_-]+\.mp4", file):
            raise VideoUnavailable("Video server returned an invalid file name")
        size = 0
        try:
            with self._http().stream("GET", f"/files/{file}") as response:
                if response.status_code != 200:
                    raise VideoUnavailable("Rendered video not found on the video server")
                with destination.open("wb") as stream:
                    for chunk in response.iter_bytes():
                        size += len(chunk)
                        stream.write(chunk)
        except httpx.HTTPError:
            raise VideoUnavailable("Video server unreachable") from None
        return size

    def discard(self, file: str) -> None:
        """Best effort: the server also deletes old files by itself."""
        if re.fullmatch(r"[A-Za-z0-9_-]+\.mp4", file):
            try:
                self._http().delete(f"/files/{file}")
            except (httpx.HTTPError, VideoUnavailable):
                pass

    def close(self) -> None:
        if self._client is not None:
            self._client.close()
        if self._embedded is not None:
            self._embedded.stop()


class VideoStorage:
    """MP4 files of finished videos, one per job."""
    def __init__(self, root: Path):
        self.root = root.resolve()

    def path(self, job_id: str) -> Path:
        if not re.fullmatch(r"[0-9a-f-]{36}", job_id):
            raise FileNotFoundError("Video not found")
        path = self.root / f"{job_id}.mp4"
        if path.is_symlink():
            raise FileNotFoundError("Video not found")
        return path

    def prepare(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
