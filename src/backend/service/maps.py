import csv
import io
from uuid import UUID

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


class MapsService:
    """Lets signed-in panel users run searches on the maps server with the server's own key."""
    def __init__(self, connection: MapsConnection):
        self.connection = connection

    def _call(self, method: str, path: str, **kwargs):
        if not self.connection.configured:
            raise MapsNotConfigured("Maps server is not configured")
        response = self.connection.request(method, path, **kwargs)
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
