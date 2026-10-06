import hashlib
import json
import logging
from collections.abc import Callable
from typing import Any

from redis import Redis
from redis.exceptions import RedisError

logger = logging.getLogger(__name__)

# A slow database read cannot repopulate the generation invalidated by a writer.
STORE_IF_CURRENT = """
local current = redis.call('GET', KEYS[1]) or '0'
if current ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
return 1
"""

# A normal cache hit used to make two sequential Redis round trips: one for
# the generation and one for the payload.  Railway Redis is remote from the
# API process, so that latency was visible in every list endpoint.  Resolve
# both values atomically in one small Lua call instead.
READ_CURRENT = """
local generation = redis.call('GET', KEYS[1]) or '0'
local payload = redis.call('GET', ARGV[1] .. generation .. ':' .. ARGV[2])
return {generation, payload}
"""


class CacheAside:
    def __init__(self, redis: Redis, *, ttl: int, prefix: str):
        if ttl < 1 or not prefix:
            raise ValueError("Cache requires positive TTL and a namespace")
        self.redis, self.ttl, self.prefix = redis, ttl, prefix

    def generation_key(self, table: str) -> str:
        return f"{self.prefix}:{table}:generation"

    def query_key(self, table: str, generation: str, query: dict) -> str:
        digest = self._query_digest(query)
        return f"{self.prefix}:{table}:{generation}:{digest}"

    @staticmethod
    def _query_digest(query: dict) -> str:
        canonical = json.dumps(query, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode()).hexdigest()

    def _read_current(self, table: str, query: dict) -> tuple[str, str | None]:
        reply = self.redis.eval(
            READ_CURRENT, 1, self.generation_key(table), f"{self.prefix}:{table}:",
            self._query_digest(query),
        )
        if not isinstance(reply, (list, tuple)) or len(reply) != 2:
            raise RedisError("Invalid cache response")
        generation, payload = reply
        if isinstance(generation, bytes):
            generation = generation.decode()
        if isinstance(payload, bytes):
            payload = payload.decode()
        return str(generation or "0"), payload

    def read(self, table: str, query: dict, loader: Callable[[], Any]):
        try:
            generation, payload = self._read_current(table, query)
            key = self.query_key(table, generation, query)
            if payload is not None:
                try:
                    envelope = json.loads(payload)
                    if (isinstance(envelope, dict) and envelope.get("schema") == 1
                            and "value" in envelope):
                        return envelope["value"]
                except (ValueError, TypeError):
                    pass
        except RedisError:
            logger.warning("Cache read unavailable; using database")
            return loader()
        value = loader()  # Database failures must propagate, never be disguised as cache misses.
        try:
            self.redis.eval(STORE_IF_CURRENT, 2, self.generation_key(table), key,
                            generation, json.dumps({"schema": 1, "value": value}), self.ttl)
        except RedisError:
            logger.warning("Cache fill unavailable")
        return value

    def invalidate(self, tables: set[str]) -> bool:
        if not tables:
            return True
        try:
            with self.redis.pipeline(transaction=True) as pipeline:
                for table in sorted(tables):
                    pipeline.incr(self.generation_key(table))
                pipeline.execute()
            return True
        except RedisError:
            # DB has already committed. Do not report a rollback that did not happen.
            logger.warning("Post-commit cache invalidation failed; TTL bounds stale entries")
            return False
