from fastapi import APIRouter, Depends, HTTPException, Request, Response
from redis.exceptions import RedisError

from backend.controller.dependencies import current_user
from backend.controller.schema.passwords import (
    PasswordChangeInput,
    RecoveryConfirmInput,
    RecoveryRequestInput,
)
from backend.infra.connections.email import EmailUnavailableError
from backend.service.passwords import PasswordRecoveryError
from backend.service.security import AuthenticationError

router = APIRouter(prefix="/auth/password", tags=["passwords"])


def clear_session(request):
    settings = request.app.state.settings
    response = Response(status_code=204)
    response.delete_cookie(settings.auth_cookie_name, path="/", httponly=True,
                           secure=settings.cookie_secure, samesite=settings.cookie_samesite)
    return response


@router.post("/change", status_code=204)
def change(data: PasswordChangeInput, request: Request, actor=Depends(current_user)):
    try:
        request.app.state.services.password_service.change(
            actor, data.current_password.get_secret_value(), data.new_password.get_secret_value())
    except PasswordRecoveryError:
        raise HTTPException(status_code=400, detail="Current password is incorrect") from None
    except AuthenticationError:
        raise HTTPException(status_code=401, detail="Invalid or expired session") from None
    return clear_session(request)


@router.post("/recovery/request", status_code=202)
def request_code(data: RecoveryRequestInput, request: Request):
    try:
        request.app.state.services.password_service.request_code(str(data.email))
    except (RedisError, EmailUnavailableError):
        raise HTTPException(status_code=503, detail="Password recovery unavailable") from None
    return {"detail": "If the account is eligible, a recovery code will be sent"}


@router.post("/recovery/confirm", status_code=204)
def confirm(data: RecoveryConfirmInput, request: Request):
    try:
        request.app.state.services.password_service.confirm(
            str(data.email), data.code.get_secret_value(), data.new_password.get_secret_value())
    except PasswordRecoveryError:
        raise HTTPException(status_code=400, detail="Invalid or expired recovery code") from None
    except RedisError:
        raise HTTPException(status_code=503, detail="Password recovery unavailable") from None
    return clear_session(request)
