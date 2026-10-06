from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from redis import Redis

from backend.repository.redis.email_codes import EmailCodeRepository


@pytest.fixture
def codes(local_redis_url):
    client = Redis.from_url(local_redis_url, decode_responses=True)
    repository = EmailCodeRepository(client, "test:recovery:" + uuid4().hex,
                                     ttl=600, max_attempts=3, cooldown=60)
    yield repository
    keys = list(client.scan_iter(repository.namespace + ":*"))
    if keys:
        client.unlink(*keys)
    client.close()


def test_code_ttl_cooldown_attempts_and_resend(codes):
    email, record = "ana@example.com", {"user_id": "user", "version": 2}
    assert codes.issue(email, "digest-one", record)
    assert 0 < codes.redis.ttl(codes.key(email)) <= 600
    assert not codes.issue(email, "digest-two", record)
    assert codes.consume(email, "wrong") is None
    assert codes.redis.hget(codes.key(email), "attempts") == "1"
    assert codes.consume(email, "wrong") is None
    assert codes.consume(email, "wrong") is None
    assert codes.consume(email, "digest-one") is None
    codes.redis.delete(codes.key(email) + ":cooldown")
    assert codes.issue(email, "digest-two", record)
    codes.remove(email, "digest-one")
    assert codes.consume(email, "digest-two") == record
    assert codes.consume(email, "digest-two") is None


def test_expiration_rejects_code(codes):
    codes.issue("ana@example.com", "digest", {"user_id": "user", "version": 0})
    codes.redis.expire(codes.key("ana@example.com"), 0)
    assert codes.consume("ana@example.com", "digest") is None


def test_only_one_concurrent_consumer_can_reset(codes):
    record = {"user_id": "user", "version": 0}
    codes.issue("ana@example.com", "digest", record)
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: codes.consume("ana@example.com", "digest"), range(2)))
    assert results.count(record) == 1 and results.count(None) == 1


def test_failed_delivery_removes_cooldown_but_old_digest_cannot_remove_new_code(codes):
    email = "ana@example.com"
    assert codes.issue(email, "failed-digest", {})
    codes.remove(email, "failed-digest")
    assert not codes.redis.exists(codes.key(email) + ":cooldown")
    assert codes.issue(email, "new-digest", {})
    codes.remove(email, "failed-digest")
    assert codes.redis.exists(codes.key(email) + ":cooldown")
    assert codes.consume(email, "new-digest") == {}
