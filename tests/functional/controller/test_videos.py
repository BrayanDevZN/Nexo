import time

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from backend.controller.application import create_app
from backend.domain.passwords import PasswordHasher
from tests.functional.controller.test_databases import ORIGIN, PASSWORD, add_member, sign_in

HTML = ('<!doctype html><html><body><div data-composition-id="main" data-start="0" data-duration="3" '
        'data-width="1920" data-height="1080"></div></body></html>')
FILE = "producer-project-abc123.mp4"
MP4 = b"\x00\x00\x00\x18ftypmp42fake-video-bytes"


class Servers:
    """Fakes of the video server and of Groq; each call is recorded to assert what was (not) sent."""
    def __init__(self):
        self.video_calls, self.groq_calls = [], []
        self.lint_errors: list[list[dict]] = []
        self.groq_answers = [f"```html\n{HTML}\n```"]
        self.render_error = None

    def video(self, request):
        self.video_calls.append((request.method, request.url.path))
        assert request.headers["authorization"] == "Bearer video-secret-0123456789"
        if request.url.path == "/render":
            if self.render_error:
                return httpx.Response(500, json={"success": False, "error": self.render_error})
            return httpx.Response(200, json={"success": True, "file": FILE, "fileSize": len(MP4),
                                             "videoDurationSeconds": 3})
        if request.url.path == "/lint":
            findings = self.lint_errors.pop(0) if self.lint_errors else []
            return httpx.Response(200, json={"success": True, "result": {"ok": not findings, "findings": findings}})
        if request.url.path == f"/files/{FILE}" and request.method == "GET":
            return httpx.Response(200, content=MP4)
        if request.method == "DELETE":
            return httpx.Response(204)
        return httpx.Response(404)

    def groq(self, request):
        self.groq_calls.append(request.read())
        assert request.headers["authorization"] == "Bearer gsk_test"
        answer = self.groq_answers.pop(0) if len(self.groq_answers) > 1 else self.groq_answers[0]
        return httpx.Response(200, json={"choices": [{"message": {"content": answer}}]})


@pytest.fixture
def servers():
    return Servers()


@pytest.fixture
def client(settings, local_redis_url, monkeypatch, servers, tmp_path):
    settings.redis_url = SecretStr(local_redis_url)
    settings.email = "owner@example.com"
    settings.password = SecretStr("initial-admin-password")
    settings.qdrant_url = None
    settings.upload_dir = tmp_path / "uploads"
    settings.video_url = "https://video.example.com"
    settings.video_secret = SecretStr("video-secret-0123456789")
    settings.groq_api_key = SecretStr("gsk_test")
    monkeypatch.setattr("backend.service.runtime.PasswordHasher", lambda: PasswordHasher(rounds=4))
    with TestClient(create_app(settings)) as test_client:
        videos = test_client.app.state.services.videos
        videos.connection._client = httpx.Client(
            base_url="https://video.example.com", transport=httpx.MockTransport(servers.video),
            headers={"Authorization": "Bearer video-secret-0123456789"})
        videos.groq._client = httpx.Client(base_url="https://api.groq.com/openai/v1",
                                           transport=httpx.MockTransport(servers.groq))
        yield test_client


def wait_done(client, video_id, timeout=10):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        body = client.get(f"/videos/{video_id}").json()
        if body["status"] in {"done", "failed"}:
            return body
        time.sleep(0.05)
    raise AssertionError("video did not finish")


def test_html_goes_through_queue_render_and_download(client, servers):
    headers = sign_in(client)
    created = client.post("/videos", headers=headers, json={"html": HTML})
    assert created.status_code == 202
    video_id = created.json()["id"]
    assert created.json()["status"] == "queued" and "html" not in created.json()
    done = wait_done(client, video_id)
    assert done["status"] == "done" and done["video_url"] == f"/videos/{video_id}/file"
    assert done["html"] == HTML and done["duration_seconds"] == 3 and done["file_size"] == len(MP4)
    file = client.get(done["video_url"])
    assert file.status_code == 200 and file.headers["content-type"] == "video/mp4" and file.content == MP4
    assert ("DELETE", f"/files/{FILE}") in servers.video_calls
    assert servers.groq_calls == []


def test_a_prompt_is_turned_into_html_by_groq_then_rendered(client, servers):
    headers = sign_in(client)
    created = client.post("/videos/generate", headers=headers, json={
        "prompt": "Vídeo de 20 segundos vendendo um curso de inglês", "aspect": "vertical", "seconds": 20})
    assert created.status_code == 202
    done = wait_done(client, created.json()["id"])
    assert done["status"] == "done" and done["source"] == "prompt" and done["html"] == HTML
    assert done["prompt"].startswith("Vídeo de 20 segundos")
    assert len(servers.groq_calls) == 1 and b"1080x1920" in servers.groq_calls[0]
    assert ("POST", "/lint") in servers.video_calls and ("POST", "/render") in servers.video_calls


def test_the_ai_is_asked_to_fix_what_the_render_check_finds(client, servers):
    servers.lint_errors = [[{"severity": "error", "code": "no_timeline", "message": "register the timeline"}]]
    headers = sign_in(client)
    created = client.post("/videos/generate", headers=headers, json={"prompt": "Promoção de pizzaria no fim de semana"})
    done = wait_done(client, created.json()["id"])
    assert done["status"] == "done" and len(servers.groq_calls) == 2
    assert b"no_timeline: register the timeline" in servers.groq_calls[1]
    assert [call for call in servers.video_calls if call[1] == "/lint"] == [("POST", "/lint")] * 2


def test_an_answer_without_the_root_element_is_corrected_before_linting(client, servers):
    servers.groq_answers = ["<div>sem raiz</div>", HTML]
    headers = sign_in(client)
    created = client.post("/videos/generate", headers=headers, json={"prompt": "Promoção de pizzaria no fim de semana"})
    done = wait_done(client, created.json()["id"])
    assert done["status"] == "done" and len(servers.groq_calls) == 2
    assert b"data-composition-id" in servers.groq_calls[1]
    assert [call for call in servers.video_calls if call[1] == "/lint"] == [("POST", "/lint")]


def test_a_composition_the_ai_never_gets_right_fails_without_rendering(client, servers):
    servers.groq_answers = ["<div>nada</div>"]
    headers = sign_in(client)
    created = client.post("/videos/generate", headers=headers, json={"prompt": "Promoção de pizzaria no fim de semana"})
    done = wait_done(client, created.json()["id"])
    assert done["status"] == "failed" and "valid video" in done["error"]
    assert len(servers.groq_calls) == 3 and ("POST", "/render") not in servers.video_calls


def test_a_render_error_is_recorded_on_the_job(client, servers):
    servers.render_error = "Composition has zero duration"
    headers = sign_in(client)
    done = wait_done(client, client.post("/videos", headers=headers, json={"html": HTML}).json()["id"])
    assert done["status"] == "failed" and "zero duration" in done["error"] and done["video_url"] is None
    assert client.get(f"/videos/{done['id']}/file").status_code == 404


def test_groq_is_only_required_by_the_generate_route(client, servers):
    headers = sign_in(client)
    client.app.state.services.videos.groq._key = None
    generate = client.post("/videos/generate", headers=headers, json={"prompt": "Promoção de pizzaria no fim de semana"})
    assert generate.status_code == 503 and "generator" in generate.json()["detail"]
    assert client.post("/videos", headers=headers, json={"html": HTML}).status_code == 202


def test_an_unconfigured_video_server_answers_503(client):
    headers = sign_in(client)
    client.app.state.services.videos.connection._client = None
    for path, body in (("/videos", {"html": HTML}), ("/videos/generate", {"prompt": "Promoção de pizzaria"})):
        response = client.post(path, headers=headers, json=body)
        assert response.status_code == 503 and "not configured" in response.json()["detail"]


def test_owner_admin_and_commercial_are_allowed_and_developers_are_not(client):
    for role in ("admin", "commercial"):
        add_member(client, role)
        headers = sign_in(client, f"{role}@example.com", PASSWORD)
        assert client.post("/videos", headers=headers, json={"html": HTML}).status_code == 202
    add_member(client, "dev")
    headers = sign_in(client, "dev@example.com", PASSWORD)
    assert client.post("/videos", headers=headers, json={"html": HTML}).status_code == 403
    assert client.post("/videos/generate", headers=headers, json={"prompt": "Promoção de pizzaria"}).status_code == 403
    assert client.get("/videos/3f2c1c1e-0000-4000-8000-000000000001").status_code == 403
    client.cookies.clear()
    assert client.post("/videos", headers=ORIGIN, json={"html": HTML}).status_code in {401, 403}


def test_a_commercial_api_key_works_and_a_developer_key_does_not(client, servers):
    add_member(client, "commercial")
    headers = sign_in(client, "commercial@example.com", PASSWORD)
    key = client.post("/auth/api-keys", headers=headers, json={"name": "videos"}).json()["key"]
    client.cookies.clear()
    bearer = {"Authorization": f"Bearer {key}"}
    created = client.post("/videos/generate", headers=bearer, json={"prompt": "Promoção de pizzaria no fim de semana"})
    assert created.status_code == 202
    done = wait_done_with(client, created.json()["id"], bearer)
    assert done["status"] == "done"
    assert client.get(f"/videos/{done['id']}/file", headers=bearer).content == MP4
    assert client.get("/automations", headers=bearer).status_code == 403
    add_member(client, "dev")
    dev_headers = sign_in(client, "dev@example.com", PASSWORD)
    dev_key = client.post("/auth/api-keys", headers=dev_headers, json={"name": "dev"}).json()["key"]
    client.cookies.clear()
    assert client.post("/videos", headers={"Authorization": f"Bearer {dev_key}"}, json={"html": HTML}).status_code == 403


def wait_done_with(client, video_id, headers, timeout=10):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        body = client.get(f"/videos/{video_id}", headers=headers).json()
        if body["status"] in {"done", "failed"}:
            return body
        time.sleep(0.05)
    raise AssertionError("video did not finish")


def test_the_listing_has_only_my_videos_newest_first_without_the_html(client):
    headers = sign_in(client)
    first = wait_done(client, client.post("/videos", headers=headers, json={"html": HTML}).json()["id"])["id"]
    second = wait_done(client, client.post("/videos", headers=headers, json={"html": HTML}).json()["id"])["id"]
    add_member(client, "admin")
    sign_in(client, "admin@example.com", PASSWORD)
    assert client.get("/videos").json() == []
    sign_in(client)
    listing = client.get("/videos").json()
    assert [item["id"] for item in listing] == [second, first]
    assert all("html" not in item and item["status"] == "done" for item in listing)
    add_member(client, "dev")
    sign_in(client, "dev@example.com", PASSWORD)
    assert client.get("/videos").status_code == 403


def test_a_video_belongs_to_its_creator(client):
    headers = sign_in(client)
    video_id = wait_done(client, client.post("/videos", headers=headers, json={"html": HTML}).json()["id"])["id"]
    add_member(client, "admin")
    sign_in(client, "admin@example.com", PASSWORD)
    assert client.get(f"/videos/{video_id}").status_code == 404
    assert client.get(f"/videos/{video_id}/file").status_code == 404


def test_only_two_videos_can_be_in_progress_per_member(client, servers, monkeypatch):
    headers = sign_in(client)
    # Jobs stay queued: nothing picks them up.
    monkeypatch.setattr(client.app.state.services.videos._executor, "submit", lambda *args, **kwargs: None)
    assert client.post("/videos", headers=headers, json={"html": HTML}).status_code == 202
    assert client.post("/videos", headers=headers, json={"html": HTML}).status_code == 202
    third = client.post("/videos", headers=headers, json={"html": HTML})
    assert third.status_code == 429 and "in progress" in third.json()["detail"]


def test_inputs_are_validated_before_anything_is_called(client, servers):
    headers = sign_in(client)
    for path, bad in (("/videos", {"html": "<p>"}), ("/videos", {"html": HTML, "fps": 12}),
                      ("/videos", {"html": HTML, "outputPath": "/etc/passwd"}),
                      ("/videos/generate", {"prompt": "curto"}),
                      ("/videos/generate", {"prompt": "Promoção de pizzaria", "seconds": 600}),
                      ("/videos/generate", {"prompt": "Promoção de pizzaria", "aspect": "cinema"})):
        assert client.post(path, headers=headers, json=bad).status_code == 422
    assert client.get("/videos/not-a-uuid").status_code == 422
    assert servers.video_calls == [] and servers.groq_calls == []


def test_jobs_left_running_by_a_restart_are_marked_failed(client):
    services = client.app.state.services
    with services.repositories.transaction() as repos:
        user_id = repos.users.by_email("owner@example.com").id
        job = repos.video_jobs.create(created_by_id=user_id, source="html", html=HTML, status="rendering")
        job_id = job.id
    services.videos.recover()
    with services.repositories.read_transaction() as repos:
        row = repos.video_jobs.get(job_id)
        assert row.status == "failed" and "restart" in row.error
