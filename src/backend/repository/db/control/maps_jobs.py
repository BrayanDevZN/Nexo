from datetime import datetime

from sqlalchemy import select, update

from backend.repository.db.control.base import Repository
from backend.repository.db.models import MapsJob
from backend.repository.db.models.base import utc_now


class MapsJobRepository(Repository[MapsJob]):
    model = MapsJob

    def track(self, *, job_id: str, created_by_id: str, name: str, niche: str | None, auto_expand: bool = False,
              radius: int | None = None, start_radius: int | None = None, params: str | None = None,
              max_leads: int | None = None, contact: str | None = None) -> MapsJob:
        return self.add(MapsJob(job_id=job_id, created_by_id=created_by_id, name=name[:120], niche=niche,
                                auto_expand=auto_expand, radius=radius, start_radius=start_radius, params=params,
                                max_leads=max_leads, contact=contact))

    def by_job_id(self, job_id: str) -> MapsJob | None:
        return self.session.scalar(select(MapsJob).where(MapsJob.job_id == job_id))

    def mark_expanded(self, job_id: str, new_job_id: str) -> bool:
        """Remember which search replaced this one; only one caller can win, so a search is widened once."""
        result = self.session.execute(update(MapsJob).where(
            MapsJob.job_id == job_id, MapsJob.expanded_to.is_(None)).values(expanded_to=new_job_id),
            execution_options={"synchronize_session": False})
        return result.rowcount > 0

    def pending(self, since: datetime) -> list[MapsJob]:
        return list(self.session.scalars(select(MapsJob).where(
            MapsJob.notified_at.is_(None), MapsJob.created_at >= since).order_by(MapsJob.created_at)))

    def claim(self, job_id: str) -> bool:
        """Mark a job as notified; only one caller can win, so a result is never announced twice."""
        result = self.session.execute(update(MapsJob).where(
            MapsJob.job_id == job_id, MapsJob.notified_at.is_(None)).values(notified_at=utc_now()),
            execution_options={"synchronize_session": False})
        return result.rowcount > 0
