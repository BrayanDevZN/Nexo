import logging
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from backend.domain.roles import SALES
from backend.domain.video_composition import (
    SYSTEM_PROMPT,
    extract_html,
    fix_message,
    request_message,
)
from backend.infra.connections.groq import GroqConnection, GroqNotConfigured, GroqUnavailable
from backend.infra.connections.videos import (
    VideoConnection,
    VideoRenderFailed,
    VideoStorage,
    VideoUnavailable,
)
from backend.service.access import ResourceConflict, ResourceNotFound, authorize_role

logger = logging.getLogger(__name__)

# Rendering is CPU heavy: a member can have this many videos in progress at once.
MAX_ACTIVE_PER_USER = 2
MAX_HTML_CHARS = 300_000
# First answer plus corrections after the render check finds problems.
GENERATION_ATTEMPTS = 3


class VideosNotConfigured(Exception):
    pass


class VideoGeneratorNotConfigured(Exception):
    pass


class _GenerationFailed(Exception):
    pass


class VideoService:
    """Videos from HTML or from a prompt. A job answers at once and is worked on in the background.

    The AI writes the HTML (Groq), the video server renders it (HyperFrames) and the MP4 is kept in the uploads
    volume. Jobs interrupted by a restart are marked failed when the app starts.
    """

    def __init__(self, connection: VideoConnection, groq: GroqConnection, repositories, storage: VideoStorage):
        self.connection, self.groq = connection, groq
        self.repositories, self.storage = repositories, storage
        # Two workers: the render server queues the heavy part by itself, this only overlaps AI calls with renders.
        self._executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="nexo-video")

    def recover(self) -> None:
        with self.repositories.transaction() as repos:
            repos.video_jobs.fail_unfinished("Interrupted by a server restart")

    def create(self, actor, *, html: str, fps: int, quality: str) -> dict:
        if not self.connection.available:
            raise VideosNotConfigured()
        if len(html) > MAX_HTML_CHARS:
            raise ValueError("html is too large")
        return self._submit(actor, source="html", html=html, prompt=None, fps=fps, quality=quality)

    def generate(self, actor, *, prompt: str, aspect: str, seconds: int, fps: int, quality: str) -> dict:
        if not self.connection.available:
            raise VideosNotConfigured()
        if not self.groq.available:
            raise VideoGeneratorNotConfigured()
        return self._submit(actor, source="prompt", html=None, prompt=prompt, fps=fps, quality=quality,
                            aspect=aspect, seconds=seconds)

    def get(self, actor, job_id: str) -> dict:
        with self.repositories.read_transaction() as repos:
            authorize_role(repos, actor, SALES, read=True)
            job = repos.video_jobs.get(job_id)
            if job is None or job.created_by_id != actor.id:
                raise ResourceNotFound("Video not found")
            return self._snapshot(job, with_html=True)

    def file(self, actor, job_id: str) -> Path:
        with self.repositories.read_transaction() as repos:
            authorize_role(repos, actor, SALES, read=True)
            job = repos.video_jobs.get(job_id)
            if job is None or job.created_by_id != actor.id or job.status != "done":
                raise ResourceNotFound("Video not found")
        try:
            path = self.storage.path(job_id)
        except FileNotFoundError:
            raise ResourceNotFound("Video not found") from None
        if not path.is_file():
            raise ResourceNotFound("Video not found")
        return path

    def _submit(self, actor, *, source, html, prompt, fps, quality, aspect="landscape", seconds=15) -> dict:
        with self.repositories.transaction() as repos:
            user = authorize_role(repos, actor, SALES)
            if repos.video_jobs.active_count(user.id) >= MAX_ACTIVE_PER_USER:
                raise ResourceConflict("Too many videos in progress. Wait for one to finish.")
            job = repos.video_jobs.create(created_by_id=user.id, source=source, prompt=prompt, html=html,
                                          fps=fps, quality=quality)
            snapshot = self._snapshot(job, with_html=False)
        self._executor.submit(self._run, snapshot["id"], aspect, seconds)
        return snapshot

    def _run(self, job_id: str, aspect: str, seconds: int) -> None:
        try:
            with self.repositories.read_transaction() as repos:
                job = repos.video_jobs.get(job_id)
                source, prompt, html, fps, quality = job.source, job.prompt, job.html, job.fps, job.quality
            if source == "prompt":
                self._update(job_id, status="generating")
                html = self._write_html(prompt, aspect, seconds)
            self._update(job_id, status="rendering", html=html)
            result = self.connection.render(html, fps=fps, quality=quality)
            self._store(job_id, result)
        except VideoRenderFailed as error:
            self._fail(job_id, f"Render failed: {error}")
        except _GenerationFailed as error:
            self._fail(job_id, str(error))
        except GroqNotConfigured:
            self._fail(job_id, "Video generator is not configured")
        except GroqUnavailable:
            self._fail(job_id, "Video generator unavailable")
        except VideoUnavailable:
            self._fail(job_id, "Video server unavailable")
        except Exception:
            logger.exception("Video job %s failed", job_id)
            self._fail(job_id, "Unexpected error while making the video")

    def _write_html(self, prompt: str, aspect: str, seconds: int) -> str:
        messages = [{"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": request_message(prompt, aspect=aspect, seconds=seconds)}]
        for _ in range(GENERATION_ATTEMPTS):
            answer = self.groq.complete(messages)
            html = extract_html(answer)
            if len(html) > MAX_HTML_CHARS:
                problems = ["The document is too large; make it shorter."]
            elif "data-composition-id" not in html:
                problems = ['The root element with data-composition-id="main" is missing; answer a full HTML document.']
            else:
                problems = self.connection.lint(html)
            if not problems:
                return html
            messages += [{"role": "assistant", "content": answer}, {"role": "user", "content": fix_message(problems)}]
        raise _GenerationFailed("The AI could not write a valid video after several tries. Try describing it differently.")

    def _store(self, job_id: str, result: dict) -> None:
        file = result["file"]
        self.storage.prepare()
        target = self.storage.path(job_id)
        partial = target.with_suffix(".part")
        try:
            size = self.connection.download(file, partial)
            partial.replace(target)
        finally:
            partial.unlink(missing_ok=True)
        self.connection.discard(file)
        self._update(job_id, status="done", error=None, file_size=size,
                     duration_seconds=result.get("videoDurationSeconds"))

    def _update(self, job_id: str, **values) -> None:
        with self.repositories.transaction() as repos:
            repos.video_jobs.update_fields(job_id, **values)

    def _fail(self, job_id: str, reason: str) -> None:
        try:
            self._update(job_id, status="failed", error=reason[:500])
        except Exception:
            logger.exception("Could not record the failure of video job %s", job_id)

    @staticmethod
    def _snapshot(job, *, with_html: bool) -> dict:
        data = {
            "id": job.id, "status": job.status, "source": job.source, "prompt": job.prompt, "error": job.error,
            "fps": job.fps, "quality": job.quality, "duration_seconds": job.duration_seconds,
            "file_size": job.file_size, "created_at": job.created_at, "updated_at": job.updated_at,
            "video_url": f"/videos/{job.id}/file" if job.status == "done" else None,
        }
        if with_html:
            data["html"] = job.html
        return data

    def close(self) -> None:
        self._executor.shutdown(wait=False, cancel_futures=True)
