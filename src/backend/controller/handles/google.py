import logging

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from redis.exceptions import RedisError

from backend.controller.cookies import clear_google_cookie, set_google_cookie, set_session_cookie
from backend.controller.schema.auth import ProfileInput, UserOutput
from backend.infra.connections.google import GoogleProviderError
from backend.repository.redis.oauth import OAuthStateError
from backend.service.auth import RegistrationConflict
from backend.service.google import GoogleUnavailable
from backend.service.security import AuthenticationError

router = APIRouter(prefix="/auth/google", tags=["google authentication"])
FLOW_COOKIE = "nexo_google_flow"
PROFILE_COOKIE = "nexo_google_profile"
logger = logging.getLogger(__name__)


def fail(exc):
    if isinstance(exc, (RedisError, GoogleUnavailable)):
        return HTTPException(status_code=503, detail="Google authentication unavailable")
    if isinstance(exc, RegistrationConflict):
        return HTTPException(status_code=409, detail=str(exc))
    return HTTPException(status_code=401, detail="Invalid or expired Google authentication")


@router.get("/login")
def login(request: Request):
    try:
        url, browser = request.app.state.services.google.start()
    except (RedisError, GoogleUnavailable) as exc:
        raise fail(exc) from None
    response = RedirectResponse(url, status_code=302)
    set_google_cookie(response, request.app.state.settings, FLOW_COOKIE, browser, 300)
    return response


@router.get("/callback")
async def callback(request: Request, state: str = "", code: str = ""):
    settings = request.app.state.settings
    try:
        kind, token = await request.app.state.services.google.callback(
            state, request.cookies.get(FLOW_COOKIE, ""), code)
    except (RedisError, OAuthStateError, GoogleProviderError,
            RegistrationConflict, AuthenticationError) as exc:
        logger.warning("Google callback failed: category=%s", type(exc).__name__)
        response = Response(status_code=fail(exc).status_code,
                            content='{"detail":"Google authentication failed"}',
                            media_type="application/json")
        clear_google_cookie(response, settings, FLOW_COOKIE)
        return response
    destination = "/admin" if kind == "session" else "/admin/complete-profile"
    response = RedirectResponse(settings.frontend_url.rstrip("/") + destination, status_code=302)
    clear_google_cookie(response, settings, FLOW_COOKIE)
    if kind == "session":
        set_session_cookie(response, settings, token)
    else:
        set_google_cookie(response, settings, PROFILE_COOKIE, token, 600)
    return response


@router.get("/profile")
def profile(request: Request):
    try:
        return request.app.state.services.google.profile(request.cookies.get(PROFILE_COOKIE, ""))
    except (RedisError, OAuthStateError) as exc:
        raise fail(exc) from None


@router.post("/complete", response_model=UserOutput, status_code=201)
def complete(data: ProfileInput, request: Request, response: Response):
    try:
        user, token = request.app.state.services.google.complete(
            request.cookies.get(PROFILE_COOKIE, ""), request.headers.get("x-csrf-token", ""),
            data.name, data.phone)
    except (RedisError, OAuthStateError, RegistrationConflict) as exc:
        raise fail(exc) from None
    settings = request.app.state.settings
    clear_google_cookie(response, settings, PROFILE_COOKIE)
    set_session_cookie(response, settings, token)
    return user
