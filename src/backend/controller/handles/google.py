import logging
from urllib.parse import urlencode, urlsplit

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from redis.exceptions import RedisError

from backend.controller.cookies import clear_google_cookie, set_google_cookie, set_session_cookie
from backend.controller.schema.auth import GoogleCompleteInput, UserOutput
from backend.infra.connections.google import GoogleProviderError
from backend.repository.redis.oauth import OAuthStateError
from backend.service.auth import RegistrationConflict
from backend.service.google import GoogleUnavailable
from backend.repository.redis.invitations import InvitationError
from backend.service.security import AuthenticationError

router = APIRouter(prefix="/auth/google", tags=["google authentication"])
FLOW_COOKIE = "nexo_google_flow"
PROFILE_COOKIE = "nexo_google_profile"
logger = logging.getLogger(__name__)


def fail(exc):
    if isinstance(exc, (RedisError, GoogleUnavailable)):
        return HTTPException(status_code=503, detail="Google authentication unavailable")
    if isinstance(exc, InvitationError):
        return HTTPException(status_code=404, detail="Invitation not found or expired")
    if isinstance(exc, RegistrationConflict):
        return HTTPException(status_code=409, detail=str(exc))
    return HTTPException(status_code=401, detail="Invalid or expired Google authentication")


@router.get("/login")
def login(request: Request, invite: str | None = None):
    try:
        url, browser = request.app.state.services.google.start(invite)
    except (RedisError, GoogleUnavailable, InvitationError) as exc:
        raise fail(exc) from None
    response = RedirectResponse(url, status_code=302)
    set_google_cookie(response, request.app.state.settings, FLOW_COOKIE, browser, 300)
    return response


@router.get("/callback")
async def callback(request: Request, state: str = "", code: str = "", relay: bool = False):
    settings = request.app.state.settings
    # Legacy Railway callbacks lack the frontend's host-only cookie. Return to
    # that origin before consuming state; validation and PKCE stay mandatory.
    if (not relay
            and not request.cookies.get(FLOW_COOKIE)
            and urlsplit(settings.google_redirect_uri).hostname != urlsplit(settings.frontend_url).hostname
            and state and len(state) <= 512 and code and len(code) <= 4096):
        destination = settings.frontend_url.rstrip("/") + "/api/auth/google/callback?" + urlencode(
            {"state": state, "code": code, "relay": "true"})
        return RedirectResponse(destination, status_code=302,
                                headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"})
    try:
        kind, token, invite_token = await request.app.state.services.google.callback(
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
    if invite_token:
        destination += "?" + urlencode({"invite": invite_token})
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
def complete(data: GoogleCompleteInput, request: Request, response: Response):
    try:
        user, token = request.app.state.services.google.complete(
            request.cookies.get(PROFILE_COOKIE, ""), request.headers.get("x-csrf-token", ""),
            data.name, data.phone, data.invite_token)
    except (RedisError, OAuthStateError, RegistrationConflict, InvitationError) as exc:
        raise fail(exc) from None
    settings = request.app.state.settings
    clear_google_cookie(response, settings, PROFILE_COOKIE)
    set_session_cookie(response, settings, token)
    return user
