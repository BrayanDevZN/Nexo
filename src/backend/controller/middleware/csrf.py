from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from backend.domain.csrf import CSRFService
from backend.domain.tokens import InvalidTokenError, JWTService

BOOKING_AUDIENCE = "nexo-atendimentos"
# Mutations a visitor makes before having a session: they are protected by Origin, rate limits and e-mail codes.
ANONYMOUS_MUTATIONS = frozenset({
    "/auth/login", "/auth/register", "/auth/register/confirm", "/auth/google/complete",
    "/auth/password/recovery/request", "/auth/password/recovery/confirm",
    "/atendimentos/auth/login", "/atendimentos/auth/register", "/atendimentos/auth/register/confirm",
    "/atendimentos/auth/google/complete", "/atendimentos/auth/password/recovery/request",
    "/atendimentos/auth/password/recovery/confirm",
})


class CSRFMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, settings):
        super().__init__(app)
        self.settings = settings
        secret = settings.jwt_secret_key.get_secret_value()
        self.csrf = CSRFService(secret)
        self.tokens = JWTService(secret, expire_minutes=settings.jwt_expire_minutes)
        self.booking_tokens = JWTService(secret, expire_minutes=settings.jwt_expire_minutes, audience=BOOKING_AUDIENCE)

    def _session(self, request):
        """Which cookie and token audience protect this path: the scheduling product's or the panel's."""
        if request.url.path.startswith("/atendimentos/"):
            return self.booking_tokens, self.settings.booking_cookie_name
        return self.tokens, self.settings.auth_cookie_name

    async def dispatch(self, request, call_next):
        response = None
        # Server-to-server API-key requests are authenticated by the dependency
        # layer and do not have a browser session/CSRF token.
        bearer = request.headers.get("authorization", "").lower().startswith("bearer ")
        path = request.url.path
        # Scheduling keys work on the resource routes only; accounts, passwords and key management need the session.
        booking_key_request = bearer and path.startswith("/atendimentos/") and not path.startswith("/atendimentos/auth/")
        api_key_request = (bearer and not path.startswith(("/auth/", "/atendimentos/"))) or booking_key_request
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            if api_key_request:
                pass
            elif request.headers.get("origin") not in self.settings.cors_origins:
                response = JSONResponse({"detail": "Untrusted request origin"}, status_code=403)
            elif request.url.path not in ANONYMOUS_MUTATIONS and not request.url.path.startswith("/public/"):
                if not (request.url.path.startswith("/auth/invitations/")
                        and request.url.path.endswith("/register")):
                    tokens, cookie_name = self._session(request)
                    try:
                        claims = tokens.read(request.cookies.get(cookie_name, ""))
                        if not self.csrf.verify(claims.token_id, request.headers.get("x-csrf-token", "")):
                            response = JSONResponse({"detail": "Invalid CSRF token"}, status_code=403)
                    except InvalidTokenError:
                        response = JSONResponse({"detail": "Invalid or expired session"}, status_code=401)
        if response is None:
            response = await call_next(request)
        if request.url.path.startswith(("/auth/", "/admin/", "/clients", "/public/", "/paid-leads", "/videos", "/members", "/documents", "/automations", "/chat", "/realtime", "/atendimentos")):
            response.headers["Cache-Control"] = "no-store"
        return response
