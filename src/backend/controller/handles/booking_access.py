"""Who may use the Atendimentos: the owner's panel (accounts, approvals, access links) and the person's side (a link, the redeem)."""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from backend.controller.dependencies import booking_session_user, owner_user
from backend.controller.schema.scheduling import (
    AccessDecisionInput,
    AccessLinkCreate,
    AccessLinkInfo,
    AccessLinkOutput,
    AccessRedeemInput,
    AccessUserOutput,
    AccessUsersOutput,
    BookingUserOutput,
)
from backend.service.access import ResourceConflict, ResourceNotFound
from backend.service.booking_access import AccessLinkError

admin = APIRouter(prefix="/admin/atendimentos", tags=["scheduling access (admin)"])
public = APIRouter(prefix="/atendimentos/access", tags=["scheduling access"])


def service(request: Request):
    return request.app.state.services.booking_access


@admin.get("/users", response_model=AccessUsersOutput)
def users(request: Request, status: Literal["pending", "approved", "rejected", "expired"] | None = None,
          q: str | None = Query(default=None, max_length=120), limit: int = Query(default=50, ge=1, le=100),
          offset: int = Query(default=0, ge=0), actor=Depends(owner_user)):
    return service(request).list_users(actor, status=status, query=q, limit=limit, offset=offset)


@admin.patch("/users/{user_id}", response_model=AccessUserOutput)
def decide(user_id: str, data: AccessDecisionInput, request: Request, actor=Depends(owner_user)):
    try:
        return service(request).decide(actor, user_id, decision=data.decision, days=data.days)
    except ResourceNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None


@admin.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: str, request: Request, actor=Depends(owner_user)):
    try:
        service(request).delete_user(actor, user_id)
    except ResourceNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None
    return Response(status_code=204)


@admin.get("/users/{user_id}/photo", responses={200: {"content": {"image/jpeg": {}}}})
def photo(user_id: str, request: Request, actor=Depends(owner_user)):
    try:
        data = service(request).photo(actor, user_id)
    except ResourceNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None
    return Response(content=data, media_type="image/jpeg", headers={"X-Content-Type-Options": "nosniff"})


@admin.get("/links", response_model=list[AccessLinkOutput])
def links(request: Request, actor=Depends(owner_user)):
    return service(request).list_links(actor)


@admin.post("/links", response_model=AccessLinkOutput, status_code=201)
def create_link(data: AccessLinkCreate, request: Request, actor=Depends(owner_user)):
    return service(request).create_link(actor, note=data.note, access_days=data.access_days, max_uses=data.max_uses,
                                        valid_days=data.valid_days)


@admin.delete("/links/{link_id}", status_code=204)
def delete_link(link_id: str, request: Request, actor=Depends(owner_user)):
    try:
        service(request).delete_link(actor, link_id)
    except ResourceNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None


@public.get("/{token}", response_model=AccessLinkInfo)
def inspect(token: str, request: Request):
    try:
        return service(request).inspect_link(token)
    except AccessLinkError:
        raise HTTPException(status_code=404, detail="Link not found or expired") from None


@public.post("/redeem", response_model=BookingUserOutput)
def redeem(data: AccessRedeemInput, request: Request, actor=Depends(booking_session_user)):
    """A signed-in account that is waiting (or whose permission ended) opens a link and gets the permission."""
    try:
        service(request).redeem(actor.id, data.token)
    except AccessLinkError:
        raise HTTPException(status_code=404, detail="Link not found or expired") from None
    except ResourceConflict as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from None
    return request.app.state.services.booking_sessions.authenticate(
        request.cookies.get(request.app.state.settings.booking_cookie_name, ""))
