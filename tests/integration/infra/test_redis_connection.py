from uuid import uuid4

from backend.infra.connections.redis import RedisConnection


def test_real_redis_round_trip(settings, local_redis_url):
    from pydantic import SecretStr
    settings.redis_url = SecretStr(local_redis_url)
    connection = RedisConnection(settings)
    key = "nexo-test:" + uuid4().hex
    try:
        assert connection.ping()
        connection.client.set(key, "value", ex=30)
        assert connection.client.get(key) == "value"
        assert 0 < connection.client.ttl(key) <= 30
        connection.client.delete(key)
        assert connection.client.get(key) is None
    finally:
        connection.client.delete(key)
        connection.close()
