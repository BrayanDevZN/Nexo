import httpx

from backend.infra.config.settings import Settings


class MapsUnavailable(Exception):
    pass


class MapsConnection:
    """HTTP client for the maps server, which expects a Nexo API key as a Bearer token."""
    def __init__(self, settings: Settings, transport: httpx.BaseTransport | None = None):
        self.url = settings.maps_url.rstrip("/") if settings.maps_url else None
        key = settings.maps_api_key.get_secret_value() if settings.maps_api_key else None
        self._client = None
        if self.url and key:
            self._client = httpx.Client(
                base_url=self.url, timeout=settings.maps_timeout_seconds, trust_env=False,
                headers={"Authorization": f"Bearer {key}"}, transport=transport,
            )

    @property
    def configured(self) -> bool:
        return self._client is not None

    def request(self, method: str, path: str, **kwargs) -> httpx.Response:
        try:
            return self._client.request(method, path, **kwargs)
        except httpx.HTTPError:
            raise MapsUnavailable("Maps server unreachable") from None

    def close(self) -> None:
        if self._client is not None:
            self._client.close()
