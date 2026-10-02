from dataclasses import dataclass

COUNTER = """
local blocked = 0
local retry_ms = 0
for i, key in ipairs(KEYS) do
  local count = redis.call('INCR', key)
  local window_ms = tonumber(ARGV[(i - 1) * 2 + 2])
  local ttl = redis.call('PTTL', key)
  if count == 1 or ttl < 0 then
    redis.call('PEXPIRE', key, window_ms)
    ttl = window_ms
  end
  if count > tonumber(ARGV[(i - 1) * 2 + 1]) then
    blocked = 1
    retry_ms = math.max(retry_ms, ttl)
  end
end
return {blocked, retry_ms}
"""


@dataclass(frozen=True)
class RateBudget:
    key: str
    limit: int
    window_seconds: int


@dataclass(frozen=True)
class RateResult:
    allowed: bool
    retry_after: int


class RateLimitRepository:
    def __init__(self, redis):
        self.redis = redis

    def check(self, budgets: list[RateBudget]) -> RateResult:
        if not budgets or any(b.limit < 1 or b.window_seconds < 1 for b in budgets):
            raise ValueError("Positive rate budgets are required")
        args = []
        for budget in budgets:
            args.extend([budget.limit, budget.window_seconds * 1000])
        blocked, retry_ms = self.redis.eval(COUNTER, len(budgets),
                                            *[b.key for b in budgets], *args)
        return RateResult(not bool(blocked), max(1, (int(retry_ms) + 999) // 1000) if blocked else 0)
