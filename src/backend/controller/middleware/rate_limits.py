import asyncio

from redis.exceptions import RedisError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from starlette.routing import Match


def route_template(request):
    # The middleware runs before routing; never key on attacker-supplied IDs or queries.
    partial = None
    candidates = [*getattr(request.app.state, "rate_limit_routes", []), *request.app.routes]
    for route in candidates:
        # New FastAPI versions keep included routers as lazy wrappers without a path.
        if not isinstance(getattr(route, "path", None), str):
            continue
        match, _ = route.matches(request.scope)
        if match == Match.FULL:
            return getattr(route, "path", "unmatched")
        if match == Match.PARTIAL and partial is None:
            partial = getattr(route, "path", "unmatched")
    return partial or "unmatched"


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if request.method == "OPTIONS" or (request.method in {"GET", "HEAD"}
                                          and request.url.path in {"/health", "/health/ready"}):
            return await call_next(request)
        try:
            result = await asyncio.to_thread(
                request.app.state.services.rate_limits.check,
                request.client.host if request.client else "unknown",
                request.method, route_template(request))
        except RedisError:
            return JSONResponse({"detail": "Request limiting unavailable"}, status_code=503,
                                headers={"Cache-Control": "no-store"})
        if not result.allowed:
            return JSONResponse({"detail": "Too many requests"}, status_code=429,
                                headers={"Retry-After": str(result.retry_after), "Cache-Control": "no-store"})
        return await call_next(request)
