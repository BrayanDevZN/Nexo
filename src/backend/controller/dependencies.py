from fastapi import HTTPException, Request

from backend.domain.roles import ADMINISTRATORS, DEVELOPERS, SALES, TEAM_MANAGERS, has_role
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


def api_key_user(request: Request):
    # API key only: a session cookie never satisfies this dependency.
    user = _header_api_key(request)
    if user is None:
        raise HTTPException(status_code=401, detail="API key required")
    return user


def approved_user(request: Request):
    user = _header_api_key(request) or current_user(request)
    if user.status != "approved":
        raise HTTPException(status_code=403, detail="Account awaiting approval")
    return user


def admin_user(request: Request):
    user = approved_user(request)
    if not has_role(user, ADMINISTRATORS):
        raise HTTPException(status_code=403, detail="Administrator access required")
    return user


def owner_user(request: Request):
    user = approved_user(request)
    if not has_role(user, TEAM_MANAGERS):
        raise HTTPException(status_code=403, detail="Owner access required")
    return user


def developer_user(request: Request):
    user = approved_user(request)
    if not has_role(user, DEVELOPERS):
        raise HTTPException(status_code=403, detail="Developer access required")
    return user


def commercial_user(request: Request):
    user = approved_user(request)
    if not has_role(user, SALES):
        raise HTTPException(status_code=403, detail="Commercial access required")
    return user
