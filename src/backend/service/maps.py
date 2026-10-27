import base64
import csv
import hashlib
import io
import json
import logging
import threading
from datetime import timedelta
from uuid import UUID, uuid4

from cryptography.fernet import Fernet, InvalidToken

from backend.infra.connections.maps import MapsConnection, MapsUnavailable
from backend.repository.db.models.base import utc_now
from backend.service.clients import lead_phone

logger = logging.getLogger(__name__)

MAX_ROWS = 1000
# A search in the default place that finds nothing is repeated with a radius twice as big, up to this one (meters).
MAX_RADIUS = 50000
# Searches older than this are no longer announced (the server may have been down for a long time).
NOTIFY_WINDOW = timedelta(hours=6)
EMAIL_LEADS = 10
LEAD_FIELDS = ("title", "category", "address", "phone", "website", "emails",
               "review_rating", "review_count", "link", "latitude", "longitude")


class MapsNotConfigured(Exception):
    pass


class MapsUnauthorized(Exception):
    pass


class MapsJobNotFound(Exception):
    pass


def _pick(item: dict, *names: str):
    for name in names:
        if name in item:
            return item[name]
    return None


class MapsKeyRejected(Exception):
    pass


class MapsService:
    """Lets signed-in panel users run searches on the maps server with the saved Nexo API key."""
    def __init__(self, connection: MapsConnection, repositories, secret: str):
        self.connection = connection
        self.repositories = repositories
        # Set by the runtime: emails, push and the in-app notice when a search finishes.
        self.messages = None
        self.push = None
        self._expand_lock = threading.Lock()
        # The saved key is encrypted at rest. Rotating the JWT secret makes it unreadable (re-enter it).
        self._fernet = Fernet(base64.urlsafe_b64encode(hashlib.sha256(b"nexo-maps-key:" + secret.encode()).digest()))

    def _stored(self, user_id: str | None = None):
        with self.repositories.read_transaction() as repos:
            row = repos.maps_credentials.current(user_id)
            if row is None:
                return None
            try:
                return (self._fernet.decrypt(row.api_key_encrypted.encode()).decode(), row.key_prefix, row.updated_at,
                        row.user_id is not None)
            except InvalidToken:
                return None

    def _key(self, user_id: str | None = None) -> str | None:
        stored = self._stored(user_id)
        return stored[0] if stored else self.connection.env_key

    def status(self, user_id: str | None = None) -> dict:
        stored = self._stored(user_id)
        if stored:
            return {"configured": self.connection.available, "source": "panel", "key_prefix": stored[1],
                    "updated_at": stored[2], "own": stored[3]}
        env_key = self.connection.env_key
        return {"configured": bool(env_key and self.connection.available), "source": "environment" if env_key else None,
                "key_prefix": env_key[:14] if env_key else None, "updated_at": None, "own": False}

    def save_key(self, actor, raw: str) -> dict:
        if not self.connection.available:
            raise MapsNotConfigured("Maps server is not configured")
        # Never store a key the maps server does not accept.
        probe = self.connection.request("GET", "/api/v1/jobs", raw)
        if probe.status_code in {401, 403}:
            raise MapsKeyRejected("The maps server rejected this API key")
        if probe.status_code >= 400:
            raise MapsUnavailable("Maps server error")
        with self.repositories.transaction() as repos:
            repos.maps_credentials.replace(api_key_encrypted=self._fernet.encrypt(raw.encode()).decode(),
                                           key_prefix=raw[:14], updated_by_id=actor.id, user_id=actor.id)
        return self.status(actor.id)

    def clear_key(self, user_id: str | None = None) -> dict:
        with self.repositories.transaction() as repos:
            repos.maps_credentials.clear(user_id)
        return self.status(user_id)

    def _call(self, method: str, path: str, *, user_id: str | None = None, **kwargs):
        key = self._key(user_id)
        if not key or not self.connection.available:
            raise MapsNotConfigured("Maps server is not configured")
        response = self.connection.request(method, path, key, **kwargs)
        if response.status_code in {401, 403}:
            raise MapsUnauthorized("Maps server rejected the Nexo API key")
        if response.status_code == 404:
            raise MapsJobNotFound("Job not found")
        if response.status_code >= 400:
            raise MapsUnavailable("Maps server error")
        return response

    @staticmethod
    def _summary(item: dict) -> dict:
        return {
            "id": str(_pick(item, "ID", "id") or ""), "name": _pick(item, "Name", "name") or "",
            "status": str(_pick(item, "Status", "status") or "").lower(),
            "created_at": _pick(item, "Date", "date"),
        }

    def jobs(self, user_id: str | None = None) -> list[dict]:
        body = self._call("GET", "/api/v1/jobs", user_id=user_id).json() or []
        jobs = [self._summary(item) for item in body if isinstance(item, dict)]
        return sorted(jobs, key=lambda job: job["created_at"] or "", reverse=True)

    def create(self, data: dict, actor_id: str | None = None) -> dict:
        body = {
            "name": data["name"], "keywords": data["keywords"], "lang": data["lang"],
            "zoom": data["zoom"], "lat": str(data["lat"]), "lon": str(data["lon"]),
            "radius": data["radius"], "depth": data["depth"], "email": data["email"],
            "fast_mode": data["fast_mode"], "max_time": data["max_time"],
        }
        created = self._call("POST", "/api/v1/jobs", user_id=actor_id, json=body).json()
        job_id = str(created["id"])
        if actor_id:
            params = json.dumps({"body": body, "base_name": data["name"]})
            with self.repositories.transaction() as repos:
                repos.maps_jobs.track(job_id=job_id, created_by_id=actor_id, name=data["name"], niche=data.get("niche"),
                                      auto_expand=bool(data.get("auto_expand")), radius=data["radius"],
                                      start_radius=data["radius"], params=params)
        return {"id": job_id}

    def job(self, job_id: UUID, user_id: str | None = None) -> dict:
        return self._summary(self._call("GET", f"/api/v1/jobs/{job_id}", user_id=user_id).json())

    def _download(self, job_id: UUID | str, user_id: str | None = None) -> list[dict]:
        text = self._call("GET", f"/api/v1/jobs/{job_id}/download", user_id=user_id).content.decode("utf-8", "replace")
        try:
            return [self._lead(row) for row in csv.DictReader(io.StringIO(text))]
        except csv.Error:
            raise MapsUnavailable("Maps results could not be read") from None

    def results(self, job_id: UUID, user_id: str | None = None) -> dict:
        leads = self._download(job_id, user_id)
        fresh = self._without_funnel(leads)
        rows = fresh[:MAX_ROWS]
        info = self._expansion(str(job_id))
        if not leads:
            # Nothing at all on the map: a search in the default place goes on with a bigger radius.
            info["expanded_to"] = self._try_expand(str(job_id), known_count=0) or info["expanded_to"]
        return {"rows": rows, "total": len(fresh), "truncated": len(fresh) > len(rows),
                "in_funnel": len(leads) - len(fresh), **info}

    def _expansion(self, job_id: str) -> dict:
        """What the panel needs to explain a widened search: the radius now, where it started and what replaced it."""
        with self.repositories.read_transaction() as repos:
            tracked = repos.maps_jobs.by_job_id(job_id)
            if tracked is None:
                return {"auto_expand": False, "radius": None, "start_radius": None, "expanded_to": None}
            return {"auto_expand": bool(tracked.auto_expand), "radius": tracked.radius,
                    "start_radius": tracked.start_radius, "expanded_to": tracked.expanded_to}

    def _try_expand(self, job_id: str, known_count: int | None = None) -> str | None:
        try:
            return self.expand_if_empty(job_id, known_count)
        except (MapsNotConfigured, MapsUnauthorized, MapsJobNotFound, MapsUnavailable):
            logger.warning("Maps search could not be widened", exc_info=True)
            return None

    def expand_if_empty(self, job_id: str, known_count: int | None = None) -> str | None:
        """Repeat a finished search that found nothing with a radius twice as big. Returns the new search's id.

        Only searches made in the default place are widened (the creator picked "auto_expand"); a place typed
        by the user is searched only in that perimeter. A search is widened once, up to MAX_RADIUS.
        """
        with self._expand_lock:
            with self.repositories.read_transaction() as repos:
                tracked = repos.maps_jobs.by_job_id(job_id)
                if tracked is None or not tracked.auto_expand:
                    return None
                if tracked.expanded_to:
                    return tracked.expanded_to
                radius, start, params, name, niche, owner = (tracked.radius or 0, tracked.start_radius, tracked.params,
                                                             tracked.name, tracked.niche, tracked.created_by_id)
            if not params or not radius or radius >= MAX_RADIUS:
                return None
            if self.job(UUID(job_id), owner)["status"] != "ok":
                return None
            if known_count is None:
                known_count = len(self._download(job_id, owner))
            if known_count:
                return None
            data = json.loads(params)
            bigger = min(radius * 2, MAX_RADIUS)
            body = {**data["body"], "radius": bigger, "name": f"{data.get('base_name') or name} · {bigger / 1000:g} km"[:80]}
            created = self._call("POST", "/api/v1/jobs", user_id=owner, json=body).json()
            new_id = str(created["id"])
            with self.repositories.transaction() as repos:
                repos.maps_jobs.track(job_id=new_id, created_by_id=owner, name=body["name"], niche=niche, auto_expand=True,
                                      radius=bigger, start_radius=start, params=json.dumps({**data, "body": body}))
                repos.maps_jobs.mark_expanded(job_id, new_id)
            return new_id

    def _without_funnel(self, leads: list[dict]) -> list[dict]:
        """Drop leads already registered as clients (same name or phone), so searches only offer new ones."""
        phones = [lead_phone(lead["phone"]) for lead in leads]
        with self.repositories.read_transaction() as repos:
            names, known_phones = repos.clients.known_contacts(
                [lead["title"].strip()[:160] for lead in leads if lead["title"]], [phone for phone in phones if phone])
        return [lead for lead, phone in zip(leads, phones, strict=True)
                if not ((lead["title"] and lead["title"].strip()[:160].lower() in names) or (phone and phone in known_phones))]

    @staticmethod
    def _lead(row: dict) -> dict:
        lead = {field: (row.get(field) or "").strip() or None for field in LEAD_FIELDS}
        try:
            lead["review_rating"] = round(float(lead["review_rating"]), 1)
        except (TypeError, ValueError):
            lead["review_rating"] = None
        try:
            lead["review_count"] = int(float(lead["review_count"]))
        except (TypeError, ValueError):
            lead["review_count"] = None
        for axis, limit in (("latitude", 90), ("longitude", 180)):
            try:
                value = float(lead[axis])
                lead[axis] = value if abs(value) <= limit else None
            except (TypeError, ValueError):
                lead[axis] = None
        return lead

    def delete(self, job_id: UUID, user_id: str | None = None) -> None:
        self._call("DELETE", f"/api/v1/jobs/{job_id}", user_id=user_id)

    def finish_pending(self) -> int:
        """Tell the creators of finished searches. Returns how many were announced."""
        if not self.connection.available:
            return 0
        with self.repositories.read_transaction() as repos:
            pending = [(job.job_id, job.created_by_id, job.name) for job in repos.maps_jobs.pending(utc_now() - NOTIFY_WINDOW)]
        announced = 0
        for creator_id in dict.fromkeys(creator for _, creator, _ in pending):
            # Each search is checked with its creator's own key.
            try:
                remote = {job["id"]: job for job in self.jobs(creator_id)}
            except (MapsNotConfigured, MapsUnauthorized, MapsUnavailable):
                continue
            for job_id, owner_id, name in pending:
                if owner_id != creator_id:
                    continue
                job = remote.get(job_id)
                if job is None:
                    # The search was deleted before finishing: nothing to announce.
                    with self.repositories.transaction() as repos:
                        repos.maps_jobs.claim(job_id)
                elif job["status"] == "ok":
                    if self._try_expand(job_id):
                        # Nothing was found, so a wider search was started: the creator is told when that one ends.
                        with self.repositories.transaction() as repos:
                            repos.maps_jobs.claim(job_id)
                        continue
                    announced += self._announce(job_id, creator_id, name, failed=False)
                elif job["status"] == "failed":
                    announced += self._announce(job_id, creator_id, name, failed=True)
        return announced

    def _announce(self, job_id: str, creator_id: str, name: str, *, failed: bool) -> int:
        found = in_funnel = 0
        leads: list[dict] = []
        if not failed:
            try:
                result = self.results(UUID(job_id), creator_id)
            except (MapsUnauthorized, MapsJobNotFound, MapsUnavailable):
                return 0  # try again on the next round
            found, in_funnel, leads = result["total"], result["in_funnel"], result["rows"][:EMAIL_LEADS]
        if failed:
            title, body = "Busca do Maps não terminou", f"A busca \"{name}\" não foi concluída. Tente outra região ou menos profundidade."
        else:
            title = "Busca do Maps concluída"
            info = self._expansion(job_id)
            radius, start = info["radius"], info["start_radius"]
            widened = bool(radius and start and radius > start)
            if not found and not in_funnel:
                body = (f"A busca \"{name}\" não encontrou nenhuma empresa"
                        + (f", nem ampliando o raio de {start / 1000:g} km até {radius / 1000:g} km" if widened else "")
                        + ". Tente outro nicho ou outra cidade.")
            else:
                body = (f"A busca \"{name}\" terminou com {found} empresa(s) nova(s)"
                        + (f" ({in_funnel} já estavam no funil)" if in_funnel else "")
                        + (f", com o raio ampliado de {start / 1000:g} km para {radius / 1000:g} km" if widened else "")
                        + ". Abra o Maps para ver.")
        with self.repositories.transaction() as repos:
            if not repos.maps_jobs.claim(job_id):
                return 0
            user = repos.users.get(creator_id)
            if user is None or user.status != "approved":
                return 0
            repos.notifications.create_announcements(
                announcement_id=str(uuid4()), recipient_ids=[user.id], creator_id=user.id, title=title, body=body)
            recipient = type("Recipient", (), {"id": user.id, "name": user.name, "email": user.email})()
        if self.push:
            try:
                self.push.notify_users([recipient.id], title, body, url="/admin?maps=" + job_id)
            except Exception:
                logger.warning("Maps push could not be delivered", exc_info=True)
        if self.messages:
            try:
                if failed:
                    self.messages.maps_failed(recipient, job_id, name)
                else:
                    self.messages.maps_results(recipient, job_id, name, found, in_funnel, leads)
            except Exception:
                logger.warning("Maps email could not be queued", exc_info=True)
        return 1
