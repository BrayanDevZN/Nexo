import base64
import csv
import hashlib
import io
from uuid import UUID

from cryptography.fernet import Fernet, InvalidToken

from backend.infra.connections.maps import MapsConnection, MapsUnavailable

MAX_ROWS = 1000
LEAD_FIELDS = ("title", "category", "address", "phone", "website", "emails",
               "review_rating", "review_count", "link")


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

    def create(self, data: dict) -> dict:
        body = {
            "name": data["name"], "keywords": data["keywords"], "lang": data["lang"],
            "zoom": data["zoom"], "lat": str(data["lat"]), "lon": str(data["lon"]),
            "radius": data["radius"], "depth": data["depth"], "email": data["email"],
            "fast_mode": data["fast_mode"], "max_time": data["max_time"],
        }
        created = self._call("POST", "/api/v1/jobs", json=body).json()
        return {"id": str(created["id"])}

    def job(self, job_id: UUID) -> dict:
        return self._summary(self._call("GET", f"/api/v1/jobs/{job_id}").json())

    def results(self, job_id: UUID) -> dict:
        text = self._call("GET", f"/api/v1/jobs/{job_id}/download").content.decode("utf-8", "replace")
        rows, total = [], 0
        try:
            for row in csv.DictReader(io.StringIO(text)):
                total += 1
                if len(rows) < MAX_ROWS:
                    rows.append(self._lead(row))
        except csv.Error:
            raise MapsUnavailable("Maps results could not be read") from None
        return {"rows": rows, "total": total, "truncated": total > len(rows)}

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
        return lead

    def delete(self, job_id: UUID) -> None:
        self._call("DELETE", f"/api/v1/jobs/{job_id}")
