from datetime import datetime

from sqlalchemy import select, update

from backend.repository.db.control.base import Repository
from backend.repository.db.models import MapsJob
from backend.repository.db.models.base import utc_now


class MapsJobRepository(Repository[MapsJob]):
    model = MapsJob

    def track(self, *, job_id: str, created_by_id: str, name: str, niche: str | None) -> MapsJob:
        return self.add(MapsJob(job_id=job_id, created_by_id=created_by_id, name=name[:120], niche=niche))

    def pending(self, since: datetime) -> list[MapsJob]:
        return list(self.session.scalars(select(MapsJob).where(
            MapsJob.notified_at.is_(None), MapsJob.created_at >= since).order_by(MapsJob.created_at)))

    def claim(self, job_id: str) -> bool:
        """Mark a job as notified; only one caller can win, so a result is never announced twice."""
        result = self.session.execute(update(MapsJob).where(
            MapsJob.job_id == job_id, MapsJob.notified_at.is_(None)).values(notified_at=utc_now()),
            execution_options={"synchronize_session": False})
        return result.rowcount > 0
