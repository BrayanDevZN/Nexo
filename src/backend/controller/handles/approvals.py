from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile
from pydantic import ValidationError

from backend.controller.dependencies import owner_user, approved_user
from backend.controller.schema.approvals import (
    AnnouncementInput,
    AnnouncementOutput,
    ApprovalInput,
    NotificationOutput,
)
from backend.controller.schema.auth import UserOutput
from backend.controller.schema.members import MemberOutput
from backend.domain.photos import PhotoTooLarge, PhotoValidationError, normalize_photo
from backend.service.access import AccessDenied
from backend.service.access import ResourceNotFound
from backend.service.announcements import AnnouncementPermissionError
from backend.service.approvals import ApprovalConflict, ApprovalNotFound, ApprovalPermissionError

users_router = APIRouter(prefix="/admin/users", tags=["user approvals"])
notifications_router = APIRouter(prefix="/admin/notifications", tags=["admin notifications"])
announcements_router = APIRouter(prefix="/admin/announcements", tags=["announcements"])
member_notifications_router = APIRouter(prefix="/notifications", tags=["member notifications"])


def fail(exc):
    status = 403 if isinstance(exc, (ApprovalPermissionError, AnnouncementPermissionError)) else 404
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


@announcements_router.post("", response_model=AnnouncementOutput, status_code=201)
def create_announcement(data: AnnouncementInput, request: Request, actor=Depends(admin_user)):
    try:
        return request.app.state.services.announcements.create(actor, title=data.title, body=data.body)
    except (AnnouncementPermissionError, ValueError) as exc:
        raise fail(exc) from None


@announcements_router.post("/with-image", response_model=AnnouncementOutput, status_code=201)
async def create_announcement_with_image(
    request: Request,
    title: str = Form(min_length=1, max_length=160),
    body: str = Form(min_length=1, max_length=5000),
    image: UploadFile | None = File(default=None),
    actor=Depends(admin_user),
):
    try:
        data = AnnouncementInput(title=title, body=body)
        image_data = None
        if image is not None:
            raw = await image.read(request.app.state.settings.profile_photo_max_bytes + 1)
            image_data = normalize_photo(
                raw,
                max_bytes=request.app.state.settings.profile_photo_max_bytes,
                max_pixels=request.app.state.settings.profile_photo_max_pixels,
            )
        return request.app.state.services.announcements.create(
            actor, title=data.title, body=data.body, image_data=image_data,
        )
    except PhotoTooLarge as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from None
    except PhotoValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors(include_input=False)) from None
    except (AnnouncementPermissionError, ValueError) as exc:
        raise fail(exc) from None
    finally:
        if image is not None:
            await image.close()


@member_notifications_router.get("", response_model=list[NotificationOutput])
def member_notifications(request: Request, kind: Literal["announcement", "member_joined", "chat_message",
                                                                    "automation_request", "automation_invitation",
                                                                    "automation_rejected"] | None = None,
                         limit: int = Query(default=50, ge=1, le=100),
                         offset: int = Query(default=0, ge=0), actor=Depends(approved_user)):
    try:
        return request.app.state.services.announcements.list_for_user(actor, kind=kind, limit=limit, offset=offset)
    except (AnnouncementPermissionError, ValueError) as exc:
        raise fail(exc) from None


@member_notifications_router.get("/unread-count")
def unread_counts(request: Request, actor=Depends(approved_user)):
    return request.app.state.services.announcements.unread_counts(actor)


@member_notifications_router.patch("/read")
def read_all_notices(request: Request, actor=Depends(approved_user)):
    count = request.app.state.services.announcements.mark_all_notices_read(actor)
    return {"marked_read": count}


@member_notifications_router.get("/{identifier}/image")
def notification_image(identifier: str, request: Request, actor=Depends(approved_user)):
    try:
        data = request.app.state.services.announcements.image(actor, identifier)
    except (AccessDenied, ResourceNotFound) as exc:
        raise fail(exc) from None
    return Response(content=data, media_type="image/jpeg", headers={
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
    })


@member_notifications_router.patch("/chat/read")
def read_all_chat_notifications(request: Request, actor=Depends(approved_user)):
    count = request.app.state.services.announcements.mark_all_chat_read(actor)
    return {"marked_read": count}


@member_notifications_router.patch("/chat/{member_id}/read")
def read_chat_notifications(member_id: str, request: Request, actor=Depends(approved_user)):
    try:
        count = request.app.state.services.announcements.mark_chat_read(actor, member_id)
        return {"marked_read": count}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None


@member_notifications_router.patch("/{identifier}/read", response_model=NotificationOutput)
def member_read_notification(identifier: str, request: Request, actor=Depends(approved_user)):
    try:
        return request.app.state.services.announcements.mark_read(actor, identifier)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None


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
