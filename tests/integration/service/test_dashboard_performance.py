from pydantic import SecretStr
from sqlalchemy import event

from backend.domain.passwords import PasswordHasher
from backend.service.runtime import RuntimeServices


def _selects(statements):
    return [statement.lower() for statement in statements if statement.lstrip().upper().startswith("SELECT")]


def test_dashboard_cache_and_list_queries_scale_without_blob_or_n_plus_one(settings, local_redis_url,
                                                                            monkeypatch, tmp_path):
    settings.redis_url = SecretStr(local_redis_url)
    settings.email = "owner@example.com"
    settings.password = SecretStr("initial-admin-password")
    settings.upload_dir = tmp_path / "uploads"
    monkeypatch.setattr("backend.service.runtime.PasswordHasher", lambda: PasswordHasher(rounds=4))
    runtime = RuntimeServices(settings)
    runtime.initialize(settings)
    try:
        actor = runtime.auth.login("owner@example.com", "initial-admin-password")[0]
        with runtime.repositories.transaction() as repos:
            first = repos.users.create(name="Ana", email="ana@example.com", password_hash="hash",
                                       status="approved")
            second = repos.users.create(name="Bia", email="bia@example.com", password_hash="hash",
                                        status="approved")
            repos.clients.create(name="Loja A", niche="Varejo", created_by_id=first.id)
            repos.clients.create(name="Loja B", niche="Varejo", created_by_id=second.id)
            repos.documents.create(filename="grande.txt", storage_key="doc-one", content=b"x" * 100_000,
                                  size=100_000, created_by_id=first.id)

        first_overview = runtime.dashboard.overview(actor)
        statements = []
        def record_cached(*args):
            statements.append(args[2])
        event.listen(runtime.database.engine, "before_cursor_execute", record_cached)
        try:
            cached_overview = runtime.dashboard.overview(actor)
        finally:
            event.remove(runtime.database.engine, "before_cursor_execute", record_cached)
        assert cached_overview == first_overview
        assert not any(table in statement for statement in _selects(statements)
                       for table in ("clients", "documents", "notifications"))

        statements = []
        def record(*args):
            statements.append(args[2])
        event.listen(runtime.database.engine, "before_cursor_execute", record)
        try:
            rows = runtime.clients.list(actor)
            documents = runtime.documents.list(actor)
        finally:
            event.remove(runtime.database.engine, "before_cursor_execute", record)
        assert {row["created_by_name"] for row in rows} == {"Ana", "Bia"}
        assert documents[0]["created_by_name"] == "Ana"
        selects = _selects(statements)
        assert len(selects) <= 6  # auth + list + one bulk creator lookup per endpoint
        document_queries = [statement for statement in selects if "from documents" in statement]
        assert document_queries and all("documents.content" not in statement for statement in document_queries)

        runtime.clients.create(actor, name="Loja C", niche="Varejo")
        assert runtime.dashboard.overview(actor)["clients_count"] == 3
    finally:
        runtime.close()
