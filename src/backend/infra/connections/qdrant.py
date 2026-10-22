import logging
from urllib.parse import quote

import httpx

from backend.infra.config.settings import Settings

logger = logging.getLogger(__name__)
MAX_COLLECTIONS = 25


class QdrantConnection:
    """Read-only view of a Qdrant instance for the administrative database page."""
    def __init__(self, settings: Settings):
        self.url = settings.qdrant_url.rstrip("/") if settings.qdrant_url else None
        self._client = None
        if self.url:
            key = settings.qdrant_api_key.get_secret_value() if settings.qdrant_api_key else None
            self._client = httpx.Client(
                base_url=self.url, timeout=settings.qdrant_timeout_seconds, trust_env=False,
                headers={"api-key": key} if key else {},
            )

    @property
    def configured(self) -> bool:
        return self._client is not None

    @property
    def dashboard_url(self) -> str | None:
        return self.url + "/dashboard" if self.url else None

    def overview(self) -> dict:
        """Return reachability, version and collection sizes without raising."""
        result = {"status": "unreachable", "version": None, "collections": [], "collections_total": 0}
        try:
            root = self._client.get("/")
            if root.status_code in {401, 403}:
                result["status"] = "unauthorized"
                return result
            root.raise_for_status()
            result["version"] = root.json().get("version")
            listing = self._client.get("/collections")
            if listing.status_code in {401, 403}:
                result["status"] = "unauthorized"
                return result
            listing.raise_for_status()
            names = [item["name"] for item in listing.json()["result"]["collections"]]
            result["collections_total"] = len(names)
            for name in names[:MAX_COLLECTIONS]:
                detail = {"name": name, "points_count": None, "status": None}
                try:
                    info = self._client.get("/collections/" + quote(name, safe=""))
                    if info.status_code == 200:
                        body = info.json()["result"]
                        detail["points_count"] = body.get("points_count")
                        detail["status"] = body.get("status")
                except (httpx.HTTPError, KeyError, ValueError):
                    pass
                result["collections"].append(detail)
            result["status"] = "online"
        except (httpx.HTTPError, KeyError, ValueError):
            logger.warning("Qdrant overview failed")
        return result

    def close(self) -> None:
        if self._client is not None:
            self._client.close()
