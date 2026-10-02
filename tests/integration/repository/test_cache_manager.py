from uuid import uuid4

import pytest
from pydantic import SecretStr
from sqlalchemy import event

from backend.infra.connections.database import DatabaseConnection
from backend.infra.connections.redis import RedisConnection
from backend.repository.cache.aside import CacheAside
from backend.repository.cache.manager import CachedRepositoryManager
from backend.repository.db.control.manager import RepositoryManager
from backend.repository.db.schema import create_tables


@pytest.fixture
def stack(settings, local_redis_url):
    settings.redis_url = SecretStr(local_redis_url)
    db, redis = DatabaseConnection(settings), RedisConnection(settings)
    create_tables(db.engine)
    prefix = "nexo-test:" + uuid4().hex
    cache = CacheAside(redis.client, ttl=30, prefix=prefix)
    raw = RepositoryManager(db, cache=cache)
    manager = CachedRepositoryManager(raw, cache)
    yield db, redis.client, cache, manager
    keys = list(redis.client.scan_iter(prefix + ":*"))
    if keys:
        redis.client.delete(*keys)
    redis.close()
    db.close()


def test_hit_avoids_sql_and_omits_authentication_secrets(stack):
    db, redis, cache, manager = stack
    with manager.transaction() as repos:
        row = repos.db.users.create(name="User", email="user@example.com", password_hash="secret-hash")
        identifier = row.id
    with manager.transaction() as repos:
        first = repos.users.get(identifier)
    statements = []
    def record(*args):
        statements.append(args[2])
    event.listen(db.engine, "before_cursor_execute", record)
    try:
        with manager.transaction() as repos:
            assert repos.users.get(identifier) == first
        assert not any(sql.lstrip().upper().startswith("SELECT") for sql in statements)
        assert "password_hash" not in first and "google_sub" not in first
        keys = [k for k in redis.scan_iter(cache.prefix + ":users:*") if not k.endswith("generation")]
        assert keys and all(0 < redis.ttl(key) <= 30 for key in keys)
    finally:
        event.remove(db.engine, "before_cursor_execute", record)


def test_mutation_invalidates_detail_and_lists_only_after_commit(stack):
    _, redis, cache, manager = stack
    with manager.transaction() as repos:
        row = repos.db.users.create(name="User", email="user@example.com", password_hash="hash")
        identifier = row.id
    with manager.transaction() as repos:
        assert repos.users.get(identifier)["status"] == "pending"
        assert len(repos.users.list(status="pending")) == 1
    generation = redis.get(cache.generation_key("users"))
    with pytest.raises(RuntimeError):
        with manager.transaction() as repos:
            repos.db.users.set_status(repos.db.users.get(identifier), "approved")
            assert repos.users.get(identifier)["status"] == "approved"  # read own write, not cache
            assert redis.get(cache.generation_key("users")) == generation
            raise RuntimeError("rollback")
    assert redis.get(cache.generation_key("users")) == generation
    with manager.transaction() as repos:
        assert repos.users.get(identifier)["status"] == "pending"
        repos.db.users.set_status(repos.db.users.get(identifier), "approved")
    assert redis.get(cache.generation_key("users")) != generation
    with manager.transaction() as repos:
        assert repos.users.get(identifier)["status"] == "approved"
        assert repos.users.list(status="pending") == []


def test_invalidation_during_load_prevents_stale_refill(stack):
    _, redis, cache, _ = stack
    def loader():
        cache.invalidate({"clients"})
        return {"name": "old"}
    query = {"operation": "get", "id": "one"}
    assert cache.read("clients", query, loader) == {"name": "old"}
    assert redis.get(cache.query_key("clients", "0", query)) is None
    assert cache.read("clients", query, lambda: {"name": "new"}) == {"name": "new"}
