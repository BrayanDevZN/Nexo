from fastapi import APIRouter, Depends, HTTPException, Request
from redis.exceptions import RedisError

from backend.controller.dependencies import current_user
from backend.controller.handles.passwords import clear_session
from backend.controller.schema.account_deletion import DeletionConfirmInput
from backend.infra.connections.email import EmailUnavailableError
from backend.service.access import AccessDenied, ResourceConflict
from backend.service.account_deletion import DeletionCodeError, DeletionCooldownError

router = APIRouter(prefix="/auth/account/deletion", tags=["account"])


def failure(error, request):
    if isinstance(error, ResourceConflict):
        return HTTPException(status_code=409, detail=str(error))
    if isinstance(error, AccessDenied):
        return HTTPException(status_code=401, detail="Invalid or expired session")
    if isinstance(error, DeletionCodeError):
        return HTTPException(status_code=400, detail="Invalid or expired deletion code")
    if isinstance(error, DeletionCooldownError):
        return HTTPException(status_code=429, detail="Wait before requesting another code",
                             headers={"Retry-After": str(request.app.state.settings.email_code_resend_cooldown_seconds)})
    return HTTPException(status_code=503, detail="Account deletion unavailable")


@router.post("/request", status_code=202)
def request_code(request: Request, actor=Depends(current_user)):
    try:
        request.app.state.services.account_deletion.request(actor)
    except (AccessDenied, ResourceConflict, DeletionCooldownError, EmailUnavailableError, RedisError) as error:
        raise failure(error, request) from None
    return {"detail": "Confirmation code sent"}


@router.post("/confirm", status_code=204)
def confirm(data: DeletionConfirmInput, request: Request, actor=Depends(current_user)):
    try:
        request.app.state.services.account_deletion.confirm(actor, data.code.get_secret_value())
    except (AccessDenied, ResourceConflict, DeletionCodeError, RedisError) as error:
        raise failure(error, request) from None
    return clear_session(request)
