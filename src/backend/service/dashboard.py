from datetime import date, datetime, time

from backend.service.access import authorize


class DashboardService:
    def __init__(self, repositories, cached_repositories):
        self.repositories, self.cached_repositories = repositories, cached_repositories

    def overview(self, actor):
        with self.repositories.transaction() as repos:
            authorize(repos, actor, approved=True)
            members = repos.users.count(status="approved")
            clients = repos.clients.count()
            today = date.today()
            months = []
            for distance in range(5, -1, -1):
                year, month = today.year, today.month - distance
                while month <= 0:
                    year -= 1
                    month += 12
                start = datetime.combine(date(year, month, 1), time.min)
                if month == 12:
                    next_start = datetime.combine(date(year + 1, 1, 1), time.min)
                else:
                    next_start = datetime.combine(date(year, month + 1, 1), time.min)
                months.append({"month": f"{year:04d}-{month:02d}", "label": date(year, month, 1).strftime("%b/%y"),
                               "count": repos.clients.count_contracts_between(start, next_start)})
        with self.cached_repositories.transaction() as cached:
            announcements = cached.notifications.list_for_recipient(actor.id, kind="announcement", limit=3, offset=0)
        return {"members_count": members, "clients_count": clients,
                "contracts_by_month": months, "announcements": announcements}
