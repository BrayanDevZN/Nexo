import logging
import re
from uuid import uuid4

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy.exc import IntegrityError

from backend.domain.roles import SALES
from backend.service.access import ResourceConflict, ResourceNotFound, authorize_role

logger = logging.getLogger(__name__)
_EMAIL = TypeAdapter(EmailStr)


def _lead_phone(value):
    """Normalize a phone read from Google Maps; numbers without a country code are Brazilian."""
    if not value:
        return None
    digits = re.sub(r"\D", "", value)
    if not value.strip().startswith("+") and len(digits) in (10, 11):
        digits = "55" + digits
    return "+" + digits if 10 <= len(digits) <= 15 else None


def _lead_email(value):
    for candidate in re.split(r"[,;\s]+", value or ""):
        try:
            return _EMAIL.validate_python(candidate)
        except ValidationError:
            continue
    return None


def _lead_notes(lead):
    rating = lead.get("review_rating")
    lines = [
        "Origem: Google Maps",
        f"Categoria no Maps: {lead['category']}" if lead.get("category") else None,
        f"Site: {lead['website']}" if lead.get("website") else None,
        f"Nota: {rating:.1f} ({lead.get('review_count') or 0} avaliações)" if rating is not None else None,
        f"Google Maps: {lead['link']}" if lead.get("link") else None,
        f"Coordenadas: {lead['latitude']}, {lead['longitude']}"
        if lead.get("latitude") is not None and lead.get("longitude") is not None else None,
    ]
    return "\n".join(line for line in lines if line)[:10000]


class ClientService:
    def __init__(self, repositories, cached_repositories, messages=None, push=None, webhook_events=None):
        self.repositories, self.cached_repositories = repositories, cached_repositories
        self.messages, self.push, self.webhook_events = messages, push, webhook_events

    @staticmethod
    def with_creator(repos, row):
        return ClientService.with_creators(repos, [row])[0]

    @staticmethod
    def with_creators(repos, rows):
        names = repos.db.users.names_by_ids(row["created_by_id"] for row in rows)
        return [{**row, "created_by_name": names.get(row["created_by_id"], "Membro removido")}
                for row in rows]

    @staticmethod
    def _record_team_notice(repos, actor_id, title, body):
        recipients = repos.users.approved_recipients()
        repos.notifications.create_announcements(
            announcement_id=str(uuid4()), recipient_ids=[user.id for user in recipients],
            creator_id=actor_id, title=title, body=body,
        )
        return recipients

    @staticmethod
    def _event_data(row):
        if hasattr(row, "model_dump"):
            return row.model_dump(mode="json")
        if isinstance(row, dict):
            return dict(row)
        return {key: value for key, value in vars(row).items() if not key.startswith("_")}

    def _emit(self, event, row):
        if not self.webhook_events:
            return
        try:
            self.webhook_events.emit(event, self._event_data(row))
        except Exception:
            logger.warning("Client webhook event could not be queued", exc_info=True)

    def _email_team(self, recipients, title, body):
        if self.messages is None:
            return
        for user in recipients:
            try:
                self.messages.announcement(user, title, body)
            except Exception:
                logger.warning("Client event email could not be queued", exc_info=True)

    def _deliver_team_notice(self, recipients, title, body):
        self._email_team(recipients, title, body)
        if self.push:
            try:
                self.push.notify_users([user.id for user in recipients], title, body)
            except Exception:
                logger.warning("Client event push could not be delivered", exc_info=True)

    def list(self, actor, **filters):
        with self.cached_repositories.read_transaction() as repos:
            authorize_role(repos.db, actor, SALES, read=True)
            return self.with_creators(repos, repos.clients.list(**filters))

    def get(self, actor, identifier):
        with self.cached_repositories.read_transaction() as repos:
            authorize_role(repos.db, actor, SALES, read=True)
            client = repos.clients.get(identifier)
            if client is None:
                raise ResourceNotFound("Client not found")
            return self.with_creator(repos, client)

    def create(self, actor, idempotency_key=None, **fields):
        identifier = str(idempotency_key) if idempotency_key else None
        notices = []
        try:
            with self.repositories.transaction() as repos:
                authorize_role(repos, actor, SALES)
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
                notices.append((self._record_team_notice(repos, actor.id, title, body), title, body))
                if row.contract_closed or row.pipeline_stage == "won":
                    title, body = "Contrato fechado", f"O contrato de {name} foi cadastrado como fechado."
                    notices.append((self._record_team_notice(repos, actor.id, title, body), title, body))
        except IntegrityError:
            if not identifier:
                raise
            with self.repositories.read_transaction() as repos:
                authorize_role(repos.db, actor, SALES, read=True)
                existing = repos.clients.get(identifier)
                if existing is None or existing.created_by_id != actor.id:
                    raise
                existing.created_by_name = repos.users.get(actor.id).name
                return existing
        for notice in notices:
            self._deliver_team_notice(*notice)
        self._emit("newClient", row)
        if row.contract_closed or row.pipeline_stage == "won":
            self._emit("closedContract", row)
        return row

    def import_leads(self, actor, niche, leads):
        """Save Google Maps leads as funnel clients, skipping ones already registered by name or phone."""
        prepared = [(lead, _lead_phone(lead.get("phone"))) for lead in leads]
        notices = []
        created, statuses = [], []
        with self.repositories.transaction() as repos:
            authorize_role(repos, actor, SALES)
            known_names, known_phones = repos.clients.known_contacts(
                [lead["title"] for lead, _ in prepared], [phone for _, phone in prepared if phone])
            creator = repos.users.get(actor.id).name
            for lead, phone in prepared:
                name = lead["title"].strip()[:160]
                if name.lower() in known_names or (phone and phone in known_phones):
                    statuses.append("duplicate")
                    continue
                row = repos.clients.create(
                    created_by_id=actor.id, name=name, niche=niche, phone=phone, email=_lead_email(lead.get("emails")),
                    address=(lead.get("address") or None), notes=_lead_notes(lead), pipeline_stage="lead")
                row.created_by_name = creator
                known_names.add(name.lower())
                if phone:
                    known_phones.add(phone)
                created.append(row)
                statuses.append("created")
            if created:
                title = "Novos leads no funil"
                body = (f"{creator} adicionou {len(created)} lead(s) do Google Maps ao funil na categoria {niche}."
                        if len(created) > 1 else f"{created[0].name} foi adicionado ao funil na categoria {niche}.")
                notices.append((self._record_team_notice(repos, actor.id, title, body), title, body))
        for notice in notices:
            self._deliver_team_notice(*notice)
        for row in created:
            self._emit("newClient", row)
        return {"created": len(created), "skipped": statuses.count("duplicate"), "items": statuses}

    def update(self, actor, identifier, **changes):
        notice = None
        webhook_event = None
        with self.repositories.transaction() as repos:
            authorize_role(repos, actor, SALES)
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
                webhook_event = "closedContract"
            elif was_closed and not is_closed:
                event = ("Contrato cancelado", f"O contrato de {row.name} foi cancelado.")
            elif previous_stage != "lost" and row.pipeline_stage == "lost":
                event = ("Contrato cancelado", f"A oportunidade de {row.name} foi encerrada e retirada do funil.")
            else:
                event = None
            if event:
                title, body = event
                recipients = self._record_team_notice(repos, actor.id, title, body)
                notice = (recipients, title, body)
        if notice:
            self._deliver_team_notice(*notice)
        if webhook_event:
            self._emit(webhook_event, row)
        return row

    def delete(self, actor, identifier):
        notice = None
        with self.repositories.transaction() as repos:
            authorize_role(repos, actor, SALES)
            client = repos.clients.get(identifier)
            if client is None:
                raise ResourceNotFound("Client not found")
            name = client.name
            if not repos.clients.delete(identifier):
                raise ResourceNotFound("Client not found")
            title, body = "Cliente removido", f"{name} foi removido do cadastro de clientes."
            recipients = self._record_team_notice(repos, actor.id, title, body)
            notice = (recipients, title, body)
        if notice:
            self._deliver_team_notice(*notice)
