from unittest.mock import Mock

import pytest
from redis.exceptions import ConnectionError

from backend.repository.cache.aside import CacheAside


def test_redis_failure_falls_back_to_database_without_hiding_db_failure():
    redis = Mock()
    redis.get.side_effect = ConnectionError("secret")
    cache = CacheAside(redis, ttl=30, prefix="unit")
    loader = Mock(return_value={"id": "one"})
    assert cache.read("users", {}, loader) == {"id": "one"}
    loader.side_effect = ValueError("db error")
    with pytest.raises(ValueError, match="db error"):
        cache.read("users", {}, loader)


def test_cached_none_and_empty_list_are_hits():
    redis = Mock()
    cache = CacheAside(redis, ttl=30, prefix="unit")
    for value in ["null", "[]"]:
        redis.get.side_effect = ["0", '{"schema":1,"value":' + value + '}']
        loader = Mock()
        assert cache.read("users", {}, loader) in [None, []]
        loader.assert_not_called()


def test_corrupt_cache_is_reloaded():
    redis = Mock()
    redis.get.side_effect = ["0", "corrupt-json"]
    loader = Mock(return_value=[])
    cache = CacheAside(redis, ttl=30, prefix="unit")
    assert cache.read("clients", {}, loader) == []
    redis.eval.assert_called_once()


def test_cache_key_is_canonical_and_does_not_expose_filter_values():
    cache = CacheAside(Mock(), ttl=30, prefix="unit")
    a = cache.query_key("users", "0", {"email": "private@example.com", "offset": 0})
    b = cache.query_key("users", "0", {"offset": 0, "email": "private@example.com"})
    assert a == b
    assert "private@example.com" not in a
