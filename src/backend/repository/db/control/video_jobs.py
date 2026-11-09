from sqlalchemy import func, select, update

from backend.repository.db.control.base import Repository
from backend.repository.db.models import VideoJob

ACTIVE = ("queued", "generating", "rendering")


class VideoJobRepository(Repository[VideoJob]):
    model = VideoJob

    def create(self, **values) -> VideoJob:
        return self.add(VideoJob(**values))

    def list_for_user(self, user_id: str, limit: int) -> list[VideoJob]:
        return list(self.session.scalars(select(VideoJob).where(VideoJob.created_by_id == user_id)
                                         .order_by(VideoJob.created_at.desc(), VideoJob.id).limit(limit)))

    def active_count(self, user_id: str) -> int:
        return self.session.scalar(select(func.count()).select_from(VideoJob).where(
            VideoJob.created_by_id == user_id, VideoJob.status.in_(ACTIVE))) or 0

    def update_fields(self, identifier: str, **values) -> None:
        self.session.execute(update(VideoJob).where(VideoJob.id == identifier).values(**values),
                             execution_options={"synchronize_session": False})

    def fail_unfinished(self, reason: str) -> int:
        """Jobs a restart interrupted can never finish: mark them failed instead of leaving them 'running'."""
        return self.session.execute(update(VideoJob).where(VideoJob.status.in_(ACTIVE)).values(
            status="failed", error=reason), execution_options={"synchronize_session": False}).rowcount
