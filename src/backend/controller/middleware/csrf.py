from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from backend.domain.csrf import CSRFService
from backend.domain.tokens import InvalidTokenError, JWTService


class CSRFMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, settings):
        super().__init__(app)
        self.settings = settings
        secret = settings.jwt_secret_key.get_secret_value()
        self.csrf = CSRFService(secret)
        self.tokens = JWTService(secret, expire_minutes=settings.jwt_expire_minutes)

    async def dispatch(self, request, call_next):
        response = None
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            if request.headers.get("origin") not in self.settings.cors_origins:
                response = JSONResponse({"detail": "Untrusted request origin"}, status_code=403)
            elif request.url.path not in {"/auth/login", "/auth/register", "/auth/google/complete"}:
                try:
                    claims = self.tokens.read(request.cookies.get(self.settings.auth_cookie_name, ""))
                    if not self.csrf.verify(claims.token_id, request.headers.get("x-csrf-token", "")):
                        response = JSONResponse({"detail": "Invalid CSRF token"}, status_code=403)
                except InvalidTokenError:
                    response = JSONResponse({"detail": "Invalid or expired session"}, status_code=401)
        if response is None:
            response = await call_next(request)
        if request.url.path.startswith("/auth/"):
            response.headers["Cache-Control"] = "no-store"
        return response
