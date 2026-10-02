from uuid import uuid4

from pydantic import SecretStr

from backend.infra.connections.database import DatabaseConnection
from backend.infra.connections.redis import RedisConnection
from backend.repository.cache.aside import CacheAside
from backend.repository.cache.manager import CachedRepositoryManager
from backend.repository.db.control.manager import RepositoryManager
from backend.repository.db.schema import create_tables


def test_client_create_read_update_delete_with_real_sqlite_and_redis(settings, local_redis_url):
    settings.redis_url = SecretStr(local_redis_url)
    db, redis = DatabaseConnection(settings), RedisConnection(settings)
    create_tables(db.engine)
    cache = CacheAside(redis.client, ttl=30, prefix="nexo-test:" + uuid4().hex)
    manager = CachedRepositoryManager(RepositoryManager(db, cache=cache), cache)
    try:
        with manager.transaction() as repos:
            user = repos.db.users.create(name="Admin", email="admin@example.com", password_hash="hash")
            client = repos.db.clients.create(name="Loja", niche="varejo", created_by_id=user.id)
            identifier = client.id
        with manager.transaction() as repos:
            assert not repos.clients.get(identifier)["contract_closed"]
            assert len(repos.clients.list()) == 1
        with manager.transaction() as repos:
            repos.db.clients.update(repos.db.clients.get(identifier), contract_closed=True)
        with manager.transaction() as repos:
            assert repos.clients.get(identifier)["contract_closed"]
            assert repos.clients.list(contract_closed=False) == []
            repos.db.clients.delete(identifier)
        with manager.transaction() as repos:
            assert repos.clients.get(identifier) is None
            assert repos.clients.list() == []
    finally:
        keys = list(redis.client.scan_iter(cache.prefix + ":*"))
        if keys:
            redis.client.delete(*keys)
        redis.close()
        db.close()
