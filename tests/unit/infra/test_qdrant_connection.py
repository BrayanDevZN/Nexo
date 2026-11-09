import httpx
from pydantic import SecretStr

from backend.infra.connections.qdrant import QdrantConnection


def connection(settings, handler, key="secret"):
    settings.qdrant_url = "https://qdrant.example.com/"
    settings.qdrant_api_key = SecretStr(key) if key else None
    qdrant = QdrantConnection(settings)
    qdrant._client = httpx.Client(base_url=qdrant.url, transport=httpx.MockTransport(handler))
    return qdrant


def test_overview_lists_collections_and_exposes_the_dashboard_link(settings):
    seen = []

    def handler(request):
        seen.append(request.url.path)
        if request.url.path == "/":
            return httpx.Response(200, json={"title": "qdrant", "version": "1.15.0"})
        if request.url.path == "/collections":
            return httpx.Response(200, json={"result": {"collections": [{"name": "leads"}]}})
        return httpx.Response(200, json={"result": {"points_count": 42, "status": "green"}})

    qdrant = connection(settings, handler)
    assert qdrant.dashboard_url == "https://qdrant.example.com/dashboard"
    assert qdrant.overview() == {"status": "online", "version": "1.15.0", "collections_total": 1,
                                 "collections": [{"name": "leads", "points_count": 42, "status": "green"}]}
    assert "/collections/leads" in seen


def test_overview_reports_a_rejected_key_and_an_unreachable_server(settings):
    assert connection(settings, lambda request: httpx.Response(401)).overview()["status"] == "unauthorized"

    def down(request):
        raise httpx.ConnectError("offline")

    assert connection(settings, down).overview()["status"] == "unreachable"


def test_qdrant_is_hidden_when_not_configured(settings):
    settings.qdrant_url = None
    assert QdrantConnection(settings).configured is False
