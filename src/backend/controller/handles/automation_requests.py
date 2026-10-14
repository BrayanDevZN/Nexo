from fastapi import APIRouter, Depends, HTTPException, Query, Request

from backend.controller.dependencies import developer_user
from backend.controller.schema.automation_requests import (
    AutomationInviteInput,
    AutomationRejectInput,
    AutomationRequestCreate,
    AutomationRequestCreated,
    AutomationRequestDecision,
    AutomationRequestOutput,
)
from backend.service.automation_requests import (
    AutomationEmailUnavailable,
    AutomationRequestConflict,
    AutomationRequestNotFound,
    AutomationRequestPermissionError,
    AutomationRequestValidationError,
)

router = APIRouter(prefix="/automation-requests", tags=["automation requests"])


def fail(error):
    if isinstance(error, AutomationRequestPermissionError):
        status = 403
    elif isinstance(error, AutomationRequestNotFound):
        status = 404
    elif isinstance(error, AutomationRequestConflict):
        status = 409
    elif isinstance(error, AutomationRequestValidationError):
        status = 422
    elif isinstance(error, AutomationEmailUnavailable):
        status = 503
    else:
        status = 400
    return HTTPException(status_code=status, detail=str(error))


@router.get("", response_model=list[AutomationRequestOutput])
def list_requests(request: Request, limit: int = Query(default=50, ge=1, le=100),
                  offset: int = Query(default=0, ge=0), actor=Depends(developer_user)):
    try:
        return request.app.state.services.automation_requests.list(actor, limit=limit, offset=offset)
    except (AutomationRequestPermissionError, ValueError) as error:
        raise fail(error) from None


@router.post("", response_model=AutomationRequestCreated, status_code=201)
def create_request(data: AutomationRequestCreate, request: Request,
                   actor=Depends(developer_user)):
    try:
        return request.app.state.services.automation_requests.create(
            actor, details=data.details,
        )
    except (AutomationRequestPermissionError, AutomationRequestConflict) as error:
        raise fail(error) from None


@router.post("/{identifier}/invite", response_model=AutomationRequestDecision)
def send_invite(identifier: str, data: AutomationInviteInput, request: Request,
                actor=Depends(developer_user)):
    try:
        return request.app.state.services.automation_requests.invite(
            actor, identifier, invite_url=str(data.invite_url), message=data.message,
        )
    except (AutomationRequestPermissionError, AutomationRequestNotFound,
            AutomationRequestConflict, AutomationRequestValidationError,
            AutomationEmailUnavailable) as error:
        raise fail(error) from None


@router.post("/{identifier}/reject", response_model=AutomationRequestDecision)
def reject_request(identifier: str, data: AutomationRejectInput, request: Request,
                   actor=Depends(developer_user)):
    try:
        return request.app.state.services.automation_requests.reject(
            actor, identifier, message=data.message,
        )
    except (AutomationRequestPermissionError, AutomationRequestNotFound,
            AutomationRequestConflict) as error:
        raise fail(error) from None

