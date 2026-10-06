from redis.asyncio import Redis


class RealtimeConnection:
    def __init__(self, settings):
        self.client = Redis.from_url(settings.redis_url.get_secret_value(), decode_responses=True,
                                     socket_connect_timeout=settings.redis_timeout_seconds,
                                     socket_timeout=settings.redis_timeout_seconds)

    async def close(self):
        await self.client.aclose()
