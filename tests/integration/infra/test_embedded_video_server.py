import shutil

import pytest
from pydantic import SecretStr

from backend.infra.connections.video_server import EmbeddedVideoServer
from backend.infra.connections.videos import VideoConnection, VideoRenderFailed

pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="Node.js is required")

# Stands in for video-server/server.mjs: same contract (HOST, PORT, VIDEO_SERVER_SECRET, /health, bearer secret).
STUB = """
import http from "node:http";
const server = http.createServer((req, res) => {
  if (req.url === "/health") { res.end('{"status":"ok"}'); return; }
  if (req.headers.authorization !== `Bearer ${process.env.VIDEO_SERVER_SECRET}`) { res.statusCode = 401; res.end("{}"); return; }
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ success: false, error: "stub render " + process.env.HOST }));
});
server.listen(Number(process.env.PORT), process.env.HOST);
process.on("SIGTERM", () => process.exit(0));
"""


@pytest.fixture
def video_dir(tmp_path):
    root = tmp_path / "video-server"
    (root / "node_modules" / "@hyperframes" / "producer").mkdir(parents=True)
    (root / "server.mjs").write_text(STUB)
    return root


@pytest.fixture
def embedded_settings(settings, tmp_path, video_dir):
    settings.upload_dir = tmp_path / "uploads"
    settings.video_server_dir = video_dir
    return settings


def test_the_server_is_only_available_when_its_files_are_installed(embedded_settings, tmp_path):
    assert VideoConnection(embedded_settings).available is True
    embedded_settings.video_server_dir = tmp_path / "missing"
    assert VideoConnection(embedded_settings).available is False
    embedded_settings.video_server_dir = tmp_path / "video-server"
    embedded_settings.video_embedded = False
    assert VideoConnection(embedded_settings).available is False


def test_an_external_server_wins_over_the_embedded_one(embedded_settings):
    embedded_settings.video_url = "https://video.example.com"
    embedded_settings.video_secret = SecretStr("external-secret-0123456789")
    connection = VideoConnection(embedded_settings)
    assert connection.available and connection._embedded is None
    connection.close()


def test_it_starts_on_first_use_on_loopback_with_a_secret_and_stops_with_the_backend(embedded_settings):
    connection = VideoConnection(embedded_settings)
    assert connection._embedded.alive() is False
    with pytest.raises(VideoRenderFailed, match="stub render 127.0.0.1"):
        connection.render("<html></html>", fps=30, quality="draft")
    process = connection._embedded._process
    assert connection._embedded.alive() and connection._embedded._url.startswith("http://127.0.0.1:")
    connection.close()
    assert process.poll() is not None


def test_it_is_started_again_when_it_dies(embedded_settings):
    connection = VideoConnection(embedded_settings)
    with pytest.raises(VideoRenderFailed):
        connection.render("<html></html>", fps=30, quality="draft")
    first = connection._embedded._process
    first.kill()
    first.wait()
    with pytest.raises(VideoRenderFailed, match="stub render"):
        connection.render("<html></html>", fps=30, quality="draft")
    assert connection._embedded._process is not first and connection._embedded.alive()
    connection.close()


def test_a_server_that_never_answers_is_reported_as_unavailable(embedded_settings, video_dir, monkeypatch):
    from backend.infra.connections import video_server
    from backend.infra.connections.videos import VideoUnavailable

    (video_dir / "server.mjs").write_text("process.exit(1)")
    monkeypatch.setattr(video_server, "START_TIMEOUT_SECONDS", 3)
    connection = VideoConnection(embedded_settings)
    with pytest.raises(VideoUnavailable, match="could not start"):
        connection.render("<html></html>", fps=30, quality="draft")
    assert EmbeddedVideoServer(embedded_settings).alive() is False
