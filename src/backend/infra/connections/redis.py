from redis import Redis
from redis.backoff import NoBackoff
from redis.retry import Retry

from backend.infra.config.settings import Settings


class RedisConnection:
    def __init__(self, settings: Settings):
        self.client = Redis.from_url(
            settings.redis_url.get_secret_value(), decode_responses=True,
            socket_connect_timeout=settings.redis_timeout_seconds,
            socket_timeout=settings.redis_timeout_seconds,
            health_check_interval=30, retry=Retry(NoBackoff(), 0),
        )

    def ping(self) -> bool:
        return bool(self.client.ping())

    def close(self) -> None:
        self.client.close()
        self.client.connection_pool.disconnect()
