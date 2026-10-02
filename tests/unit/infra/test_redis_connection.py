from unittest.mock import Mock

from backend.infra.connections.redis import RedisConnection


def test_redis_configuration_and_cleanup(settings, monkeypatch):
    factory = Mock()
    monkeypatch.setattr("backend.infra.connections.redis.Redis.from_url", factory)
    connection = RedisConnection(settings)
    options = factory.call_args.kwargs
    assert options["decode_responses"] is True
    assert options["socket_timeout"] == settings.redis_timeout_seconds
    connection.close()
    factory.return_value.close.assert_called_once()
    factory.return_value.connection_pool.disconnect.assert_called_once()
