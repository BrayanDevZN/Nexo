import logging
from uuid import uuid4

from backend.service.access import ResourceNotFound, authorize, authorize_read

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

    def _notify_team(self, actor_id, title, body):
        try:
            with self.repositories.transaction() as repos:
                recipients = repos.users.approved_recipients()
                repos.notifications.create_announcements(
                    announcement_id=str(uuid4()),
                    recipient_ids=[user.id for user in recipients],
                    creator_id=actor_id,
                    title=title,
                    body=body,
                )
        except Exception:
            # The client or contract update is already committed; notification failure
            # must not make the user retry a successful write and create a duplicate.
            logger.exception("Client event notice could not be persisted")
            return

        if self.messages is None:
            return
        for user in recipients:
            try:
                self.messages.announcement(user, title, body)
            except Exception:
                # Keep the durable in-app notice even when email delivery is unavailable.
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

    def create(self, actor, **fields):
        with self.repositories.transaction() as repos:
            authorize(repos, actor, approved=True)
            row = repos.clients.create(created_by_id=actor.id, **fields)
            row.created_by_name = repos.users.get(actor.id).name
            name, niche = row.name, row.niche
        self._notify_team(
            actor.id,
            "Novo cliente cadastrado",
            f"{name} foi adicionado ao funil na categoria {niche}.",
        )
        return row

    def update(self, actor, identifier, **changes):
        event = None
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
        if event:
            self._notify_team(actor.id, *event)
        return row

    def delete(self, actor, identifier):
        with self.repositories.transaction() as repos:
            authorize(repos, actor, approved=True)
            if not repos.clients.delete(identifier):
                raise ResourceNotFound("Client not found")
