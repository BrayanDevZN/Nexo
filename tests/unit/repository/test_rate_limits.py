from unittest.mock import Mock

import pytest

from backend.repository.redis.rate_limits import RateBudget, RateLimitRepository


def test_retry_after_rounds_up_milliseconds():
    redis = Mock()
    redis.eval.return_value = [1, 1001]
    result = RateLimitRepository(redis).check([RateBudget("key", 1, 2)])
    assert not result.allowed and result.retry_after == 2
    redis.eval.return_value = [0, 0]
    assert RateLimitRepository(redis).check([RateBudget("key", 1, 2)]).retry_after == 0


@pytest.mark.parametrize("budgets", [[], [RateBudget("key", 0, 1)], [RateBudget("key", 1, 0)]])
def test_invalid_budgets_do_not_access_redis(budgets):
    redis = Mock()
    with pytest.raises(ValueError):
        RateLimitRepository(redis).check(budgets)
    redis.eval.assert_not_called()
