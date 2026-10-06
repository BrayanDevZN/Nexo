from fastapi import HTTPException, Request

from backend.service.access import REQUEST_AUTHENTICATED
from backend.service.security import AuthenticationError


def current_user(request: Request):
    token = request.cookies.get(request.app.state.settings.auth_cookie_name, "")
    try:
        user = request.app.state.services.sessions.authenticate(token)
        setattr(user, REQUEST_AUTHENTICATED, True)
        return user
    except AuthenticationError:
        raise HTTPException(status_code=401, detail="Invalid or expired session") from None


def approved_user(request: Request):
    user = current_user(request)
    if user.status != "approved":
        raise HTTPException(status_code=403, detail="Account awaiting approval")
    return user


def admin_user(request: Request):
    user = approved_user(request)
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Administrator access required")
    return user
