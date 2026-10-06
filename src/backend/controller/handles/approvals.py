from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from backend.controller.dependencies import admin_user
from backend.controller.schema.approvals import ApprovalInput, NotificationOutput
from backend.controller.schema.auth import UserOutput
from backend.controller.schema.members import MemberOutput
from backend.service.access import AccessDenied
from backend.service.approvals import ApprovalConflict, ApprovalNotFound, ApprovalPermissionError

users_router = APIRouter(prefix="/admin/users", tags=["user approvals"])
notifications_router = APIRouter(prefix="/admin/notifications", tags=["admin notifications"])


def fail(exc):
    status = 403 if isinstance(exc, ApprovalPermissionError) else 404
    if isinstance(exc, ApprovalConflict):
        status = 409
    return HTTPException(status_code=status, detail=str(exc))


@users_router.get("", response_model=list[MemberOutput])
def users(request: Request, status: Literal["pending", "approved", "rejected"] | None = None,
          limit: int = Query(default=50, ge=1, le=100), offset: int = Query(default=0, ge=0),
          actor=Depends(admin_user)):
    try:
        return request.app.state.services.members.users(actor, status=status, limit=limit, offset=offset)
    except AccessDenied as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from None


@notifications_router.get("", response_model=list[NotificationOutput])
def notifications(request: Request, unresolved_only: bool = False,
                  limit: int = Query(default=50, ge=1, le=100), offset: int = Query(default=0, ge=0),
                  actor=Depends(admin_user)):
    try:
        return request.app.state.services.approvals.notifications(
            actor, unresolved_only=unresolved_only, limit=limit, offset=offset)
    except ApprovalPermissionError as exc:
        raise fail(exc) from None


@notifications_router.patch("/{identifier}/read", response_model=NotificationOutput)
def read_notification(identifier: str, request: Request, actor=Depends(admin_user)):
    try:
        return request.app.state.services.approvals.mark_read(actor, identifier)
    except (ApprovalPermissionError, ApprovalNotFound) as exc:
        raise fail(exc) from None


@notifications_router.post("/{identifier}/decision", response_model=UserOutput)
def decide(identifier: str, data: ApprovalInput, request: Request, actor=Depends(admin_user)):
    try:
        return request.app.state.services.approvals.decide(actor, identifier, data.decision)
    except (ApprovalPermissionError, ApprovalNotFound, ApprovalConflict) as exc:
        raise fail(exc) from None
