from backend.domain.paid_leads import PAID_SOURCE
from backend.domain.roles import SALES
from backend.service.access import ResourceNotFound, authorize_role


class PaidLeadService:
    """Visitors that came from paid ads: recorded by the site, followed up by the commercial team."""

    def __init__(self, repositories):
        self.repositories = repositories

    def record_visit(self, *, page, source, click_id=None):
        """Save a visit that came from a paid ad and return its id. Other traffic is not recorded.

        A reload of the same ad click returns the lead already saved instead of creating another one.
        """
        if source != PAID_SOURCE:
            return None
        with self.repositories.transaction() as repos:
            existing = repos.paid_leads.by_click_id(click_id) if click_id else None
            if existing is not None:
                return existing.id
            return repos.paid_leads.create(source=source, page=page, click_id=click_id).id

    def record_whatsapp_click(self, lead_id, placement):
        with self.repositories.transaction() as repos:
            lead = repos.paid_leads.get(lead_id)
            if lead is not None:
                repos.paid_leads.mark_whatsapp_click(lead, placement)

    def list(self, actor, **filters):
        with self.repositories.read_transaction() as repos:
            authorize_role(repos, actor, SALES, read=True)
            return list(repos.paid_leads.list(**filters))

    def update(self, actor, identifier, **changes):
        with self.repositories.transaction() as repos:
            authorize_role(repos, actor, SALES)
            lead = repos.paid_leads.get(identifier)
            if lead is None:
                raise ResourceNotFound("Paid lead not found")
            return repos.paid_leads.update(lead, **changes)

    def delete(self, actor, identifier):
        with self.repositories.transaction() as repos:
            authorize_role(repos, actor, SALES)
            if not repos.paid_leads.delete(identifier):
                raise ResourceNotFound("Paid lead not found")
