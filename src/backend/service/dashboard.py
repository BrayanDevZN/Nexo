from datetime import date, datetime, time

from backend.repository.cache.queries import snapshot
from backend.service.access import authorize_read


class DashboardService:
    def __init__(self, repositories, cache):
        self.repositories, self.cache = repositories, cache

    def overview(self, actor):
        with self.repositories.read_transaction() as repos:
            authorize_read(repos, actor, approved=True)
            return self.cache.read("dashboard", {"actor_id": actor.id}, lambda: self._overview(repos, actor))

    def _overview(self, repos, actor):
        """Build a cold overview with set-based SQL, then cache its JSON payload."""
        members = repos.users.count(status="approved")
        today = date.today()
        first_year, first_month = today.year, today.month - 4
        while first_month <= 0:
            first_year -= 1
            first_month += 12
        start = datetime.combine(date(first_year, first_month, 1), time.min)
        if today.month == 12:
            end = datetime.combine(date(today.year + 1, 1, 1), time.min)
        else:
            end = datetime.combine(date(today.year, today.month + 1, 1), time.min)
        clients, potential_value, closed_value, funnel, month_counts = repos.clients.dashboard_metrics(start, end)
        documents_rows = [snapshot("documents", row) for row in repos.documents.list(limit=3, offset=0)]
        names = repos.users.names_by_ids(row["created_by_id"] for row in documents_rows)
        documents = [{**row, "created_by_name": names.get(row["created_by_id"], "Membro removido")}
                     for row in documents_rows]
        announcements = [snapshot("notifications", row) for row in repos.notifications.list_for_recipient(
            actor.id, limit=3, offset=0,
        )]
        documents_count = repos.documents.count()
        months = []
        for distance in range(4, -1, -1):
            year, month = today.year, today.month - distance
            while month <= 0:
                year -= 1
                month += 12
            key = f"{year:04d}-{month:02d}"
            months.append({"month": key, "label": date(year, month, 1).strftime("%b/%y"),
                           "count": month_counts.get(key, 0)})
        return {"members_count": members, "clients_count": clients,
                "funnel": funnel, "potential_value": potential_value,
                "closed_value": closed_value,
                "conversion_rate": (funnel.get("won", 0) / clients * 100) if clients else 0,
                "documents_count": documents_count, "documents": documents,
                "contracts_by_month": months, "announcements": announcements}
