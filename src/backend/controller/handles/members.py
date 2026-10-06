from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from backend.controller.dependencies import admin_user, approved_user
from backend.controller.schema.members import MemberDirectoryOutput, MemberOutput, MemberUpdateInput
from backend.service.access import AccessDenied, ResourceConflict, ResourceNotFound

router = APIRouter(prefix="/admin/users", tags=["members"])
directory_router = APIRouter(prefix="/members", tags=["members"])


@directory_router.get("", response_model=list[MemberDirectoryOutput])
def directory(request: Request, limit: int = Query(default=50, ge=1, le=100),
              offset: int = Query(default=0, ge=0), actor=Depends(approved_user)):
    try:
        return request.app.state.services.members.directory(actor, limit=limit, offset=offset)
    except AccessDenied as error:
        raise HTTPException(status_code=403, detail=str(error)) from None


def fail(error):
    status = 403 if isinstance(error, AccessDenied) else 404 if isinstance(error, ResourceNotFound) else 409
    return HTTPException(status_code=status, detail=str(error))


@directory_router.get("/{identifier}/photo")
def member_photo(identifier: str, request: Request, actor=Depends(approved_user)):
    try:
        data = request.app.state.services.members.photo(actor, identifier)
    except (AccessDenied, ResourceNotFound) as error:
        raise fail(error) from None
    return Response(content=data, media_type="image/jpeg", headers={"X-Content-Type-Options": "nosniff"})


@router.patch("/{identifier}", response_model=MemberOutput)
def update(identifier: str, data: MemberUpdateInput, request: Request, actor=Depends(admin_user)):
    changes = data.model_dump(exclude_unset=True)
    if "email" in changes:
        changes["email"] = str(changes["email"]).lower()
    try:
        return request.app.state.services.members.update(actor, identifier, changes)
    except (AccessDenied, ResourceConflict, ResourceNotFound) as error:
        raise fail(error) from None


@router.delete("/{identifier}", status_code=204)
def delete(identifier: str, request: Request, actor=Depends(admin_user)):
    try:
        request.app.state.services.members.delete(actor, identifier)
    except (AccessDenied, ResourceConflict, ResourceNotFound) as error:
        raise fail(error) from None
    return Response(status_code=204)
