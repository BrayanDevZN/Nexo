from fastapi import HTTPException, Request

from backend.service.access import REQUEST_AUTHENTICATED
from backend.service.api_keys import ApiKeyAuthenticationError
from backend.service.security import AuthenticationError


def current_user(request: Request):
    token = request.cookies.get(request.app.state.settings.auth_cookie_name, "")
    try:
        user = request.app.state.services.sessions.authenticate(token)
        setattr(user, REQUEST_AUTHENTICATED, True)
        return user
    except AuthenticationError:
        raise HTTPException(status_code=401, detail="Invalid or expired session") from None


def _header_api_key(request: Request):
    header = request.headers.get("authorization", "")
    scheme, _, value = header.partition(" ")
    if scheme.lower() != "bearer" or not value.strip():
        return None
    try:
        user = request.app.state.services.api_keys.authenticate(value.strip())
        setattr(user, REQUEST_AUTHENTICATED, True)
        return user
    except ApiKeyAuthenticationError:
        raise HTTPException(status_code=401, detail="Invalid API key") from None


def approved_user(request: Request):
    user = _header_api_key(request) or current_user(request)
    if user.status != "approved":
        raise HTTPException(status_code=403, detail="Account awaiting approval")
    return user


def admin_user(request: Request):
    user = approved_user(request)
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Administrator access required")
    return user
