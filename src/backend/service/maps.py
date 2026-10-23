import base64
import csv
import hashlib
import io
import logging
from datetime import timedelta
from uuid import UUID, uuid4

from cryptography.fernet import Fernet, InvalidToken

from backend.infra.connections.maps import MapsConnection, MapsUnavailable
from backend.repository.db.models.base import utc_now
from backend.service.clients import lead_phone

logger = logging.getLogger(__name__)

MAX_ROWS = 1000
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
        # The saved key is encrypted at rest. Rotating the JWT secret makes it unreadable (re-enter it).
        self._fernet = Fernet(base64.urlsafe_b64encode(hashlib.sha256(b"nexo-maps-key:" + secret.encode()).digest()))

    def _stored(self):
        with self.repositories.read_transaction() as repos:
            row = repos.maps_credentials.current()
            if row is None:
                return None
            try:
                return self._fernet.decrypt(row.api_key_encrypted.encode()).decode(), row.key_prefix, row.updated_at
            except InvalidToken:
                return None

    def _key(self) -> str | None:
        stored = self._stored()
        return stored[0] if stored else self.connection.env_key

    def status(self) -> dict:
        stored = self._stored()
        if stored:
            return {"configured": self.connection.available, "source": "panel", "key_prefix": stored[1],
                    "updated_at": stored[2]}
        env_key = self.connection.env_key
        return {"configured": bool(env_key and self.connection.available), "source": "environment" if env_key else None,
                "key_prefix": env_key[:14] if env_key else None, "updated_at": None}

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
                                           key_prefix=raw[:14], updated_by_id=actor.id)
        return self.status()

    def clear_key(self) -> dict:
        with self.repositories.transaction() as repos:
            repos.maps_credentials.clear()
        return self.status()

    def _call(self, method: str, path: str, **kwargs):
        key = self._key()
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

    def jobs(self) -> list[dict]:
        body = self._call("GET", "/api/v1/jobs").json() or []
        jobs = [self._summary(item) for item in body if isinstance(item, dict)]
        return sorted(jobs, key=lambda job: job["created_at"] or "", reverse=True)

    def create(self, data: dict, actor_id: str | None = None) -> dict:
        body = {
            "name": data["name"], "keywords": data["keywords"], "lang": data["lang"],
            "zoom": data["zoom"], "lat": str(data["lat"]), "lon": str(data["lon"]),
            "radius": data["radius"], "depth": data["depth"], "email": data["email"],
            "fast_mode": data["fast_mode"], "max_time": data["max_time"],
        }
        created = self._call("POST", "/api/v1/jobs", json=body).json()
        job_id = str(created["id"])
        if actor_id:
            with self.repositories.transaction() as repos:
                repos.maps_jobs.track(job_id=job_id, created_by_id=actor_id, name=data["name"], niche=data.get("niche"))
        return {"id": job_id}

    def job(self, job_id: UUID) -> dict:
        return self._summary(self._call("GET", f"/api/v1/jobs/{job_id}").json())

    def results(self, job_id: UUID) -> dict:
        text = self._call("GET", f"/api/v1/jobs/{job_id}/download").content.decode("utf-8", "replace")
        try:
            leads = [self._lead(row) for row in csv.DictReader(io.StringIO(text))]
        except csv.Error:
            raise MapsUnavailable("Maps results could not be read") from None
        fresh = self._without_funnel(leads)
        rows = fresh[:MAX_ROWS]
        return {"rows": rows, "total": len(fresh), "truncated": len(fresh) > len(rows),
                "in_funnel": len(leads) - len(fresh)}

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

    def delete(self, job_id: UUID) -> None:
        self._call("DELETE", f"/api/v1/jobs/{job_id}")

    def finish_pending(self) -> int:
        """Tell the creators of finished searches. Returns how many were announced."""
        if not self.connection.available or not self._key():
            return 0
        with self.repositories.read_transaction() as repos:
            pending = [(job.job_id, job.created_by_id, job.name) for job in repos.maps_jobs.pending(utc_now() - NOTIFY_WINDOW)]
        if not pending:
            return 0
        try:
            remote = {job["id"]: job for job in self.jobs()}
        except (MapsNotConfigured, MapsUnauthorized, MapsUnavailable):
            return 0
        announced = 0
        for job_id, creator_id, name in pending:
            job = remote.get(job_id)
            if job is None:
                # The search was deleted before finishing: nothing to announce.
                with self.repositories.transaction() as repos:
                    repos.maps_jobs.claim(job_id)
            elif job["status"] == "ok":
                announced += self._announce(job_id, creator_id, name, failed=False)
            elif job["status"] == "failed":
                announced += self._announce(job_id, creator_id, name, failed=True)
        return announced

    def _announce(self, job_id: str, creator_id: str, name: str, *, failed: bool) -> int:
        found = in_funnel = 0
        leads: list[dict] = []
        if not failed:
            try:
                result = self.results(UUID(job_id))
            except (MapsUnauthorized, MapsJobNotFound, MapsUnavailable):
                return 0  # try again on the next round
            found, in_funnel, leads = result["total"], result["in_funnel"], result["rows"][:EMAIL_LEADS]
        if failed:
            title, body = "Busca do Maps não terminou", f"A busca \"{name}\" não foi concluída. Tente outra região ou menos profundidade."
        else:
            title = "Busca do Maps concluída"
            body = (f"A busca \"{name}\" terminou com {found} empresa(s) nova(s)"
                    + (f" ({in_funnel} já estavam no funil)" if in_funnel else "") + ". Abra o Maps para ver.")
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
