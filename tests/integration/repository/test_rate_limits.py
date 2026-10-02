import time
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from redis import Redis

from backend.repository.redis.rate_limits import RateBudget, RateLimitRepository


@pytest.fixture
def limiter(local_redis_url):
    client = Redis.from_url(local_redis_url, decode_responses=True)
    prefix = "test:rate:" + uuid4().hex
    yield RateLimitRepository(client), prefix
    keys = list(client.scan_iter(prefix + "*"))
    if keys:
        client.unlink(*keys)
    client.close()


def test_atomic_concurrent_counters_admit_exact_budget(limiter):
    repository, prefix = limiter
    budgets = [RateBudget(prefix + ":global", 5, 60), RateBudget(prefix + ":route", 100, 60)]
    with ThreadPoolExecutor(max_workers=8) as executor:
        results = list(executor.map(lambda _: repository.check(budgets), range(30)))
    assert sum(result.allowed for result in results) == 5
    assert repository.redis.get(budgets[0].key) == "30"
    assert repository.redis.get(budgets[1].key) == "30"
    assert 0 < repository.redis.pttl(budgets[0].key) <= 60000


def test_windows_expire_and_orphan_counter_ttl_is_repaired(limiter):
    repository, prefix = limiter
    budget = RateBudget(prefix, 2, 10)
    repository.redis.set(prefix, 1)
    assert repository.check([budget]).allowed
    assert repository.redis.pttl(prefix) > 0
    denied = repository.check([budget])
    assert not denied.allowed and 1 <= denied.retry_after <= 10
    repository.redis.pexpire(prefix, 1)
    time.sleep(0.02)
    assert repository.check([budget]).allowed
    assert repository.redis.get(prefix) == "1"


def test_retry_after_covers_all_blocked_windows(limiter):
    repository, prefix = limiter
    budgets = [RateBudget(prefix + ":global", 1, 20), RateBudget(prefix + ":route", 1, 10)]
    assert repository.check(budgets).allowed
    result = repository.check(budgets)
    assert not result.allowed and 19 <= result.retry_after <= 20
