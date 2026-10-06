import logging
from uuid import uuid4

from sqlalchemy.exc import IntegrityError

from backend.service.access import ResourceConflict, ResourceNotFound, authorize, authorize_read

logger = logging.getLogger(__name__)


class ClientService:
    def __init__(self, repositories, cached_repositories, messages=None):
        self.repositories, self.cached_repositories = repositories, cached_repositories
        self.messages = messages

    @staticmethod
    def with_creator(repos, row):
        return ClientService.with_creators(repos, [row])[0]

    @staticmethod
    def with_creators(repos, rows):
        """Add creator names with one indexed query for the whole page."""
        names = repos.db.users.names_by_ids(row["created_by_id"] for row in rows)
        return [{**row, "created_by_name": names.get(row["created_by_id"], "Membro removido")}
                for row in rows]

    @staticmethod
    def _record_team_notice(repos, actor_id, title, body):
        recipients = repos.users.approved_recipients()
        repos.notifications.create_announcements(
            announcement_id=str(uuid4()),
            recipient_ids=[user.id for user in recipients],
            creator_id=actor_id,
            title=title,
            body=body,
        )
        return recipients

    def _email_team(self, recipients, title, body):
        if self.messages is None:
            return
        for user in recipients:
            try:
                self.messages.announcement(user, title, body)
            except Exception:
                # The in-app notice is already durable; email remains best-effort.
                logger.warning("Client event email could not be queued", exc_info=True)

    def list(self, actor, **filters):
        with self.cached_repositories.read_transaction() as repos:
            authorize_read(repos.db, actor, approved=True)
            return self.with_creators(repos, repos.clients.list(**filters))

    def get(self, actor, identifier):
        with self.cached_repositories.read_transaction() as repos:
            authorize_read(repos.db, actor, approved=True)
            client = repos.clients.get(identifier)
            if client is None:
                raise ResourceNotFound("Client not found")
            return self.with_creator(repos, client)

    def create(self, actor, idempotency_key=None, **fields):
        identifier = str(idempotency_key) if idempotency_key else None
        email_notices = []
        try:
            with self.repositories.transaction() as repos:
                authorize(repos, actor, approved=True)
                if identifier:
                    existing = repos.clients.get(identifier)
                    if existing is not None:
                        if existing.created_by_id != actor.id:
                            raise ResourceConflict("Client idempotency key already belongs to another member")
                        existing.created_by_name = repos.users.get(actor.id).name
                        return existing
                row = repos.clients.create(created_by_id=actor.id, identifier=identifier, **fields)
                row.created_by_name = repos.users.get(actor.id).name
                name, niche = row.name, row.niche
                title, body = "Novo cliente cadastrado", f"{name} foi adicionado ao funil na categoria {niche}."
                email_notices.append((self._record_team_notice(repos, actor.id, title, body), title, body))
                if row.contract_closed or row.pipeline_stage == "won":
                    title, body = "Contrato fechado", f"O contrato de {name} foi cadastrado como fechado."
                    email_notices.append((self._record_team_notice(repos, actor.id, title, body), title, body))
        except IntegrityError:
            if not identifier:
                raise
            # Concurrent retries can both pass the initial lookup. The primary
            # key ensures only one insert succeeds; the loser returns that row.
            with self.repositories.read_transaction() as repos:
                authorize_read(repos.db, actor, approved=True)
                existing = repos.clients.get(identifier)
                if existing is None or existing.created_by_id != actor.id:
                    raise
                existing.created_by_name = repos.users.get(actor.id).name
                return existing
        for recipients, title, body in email_notices:
            self._email_team(recipients, title, body)
        return row

    def update(self, actor, identifier, **changes):
        email_notice = None
        with self.repositories.transaction() as repos:
            authorize(repos, actor, approved=True)
            client = repos.clients.get(identifier)
            if client is None:
                raise ResourceNotFound("Client not found")
            was_closed = bool(client.contract_closed or client.pipeline_stage == "won")
            previous_stage = client.pipeline_stage
            row = repos.clients.update(client, **changes)
            is_closed = bool(row.contract_closed or row.pipeline_stage == "won")
            row.created_by_name = repos.users.get(row.created_by_id).name
            if not was_closed and is_closed:
                event = ("Contrato fechado", f"O contrato de {row.name} foi marcado como fechado.")
            elif was_closed and not is_closed:
                event = ("Contrato cancelado", f"O contrato de {row.name} foi cancelado.")
            elif previous_stage != "lost" and row.pipeline_stage == "lost":
                event = ("Oportunidade encerrada", f"A oportunidade de {row.name} foi marcada como perdida.")
            else:
                event = None
            if event:
                title, body = event
                recipients = self._record_team_notice(repos, actor.id, title, body)
                email_notice = (recipients, title, body)
        if email_notice:
            self._email_team(*email_notice)
        return row

    def delete(self, actor, identifier):
        with self.repositories.transaction() as repos:
            authorize(repos, actor, approved=True)
            if not repos.clients.delete(identifier):
                raise ResourceNotFound("Client not found")
