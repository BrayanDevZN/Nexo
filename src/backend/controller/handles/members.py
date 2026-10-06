from fastapi import APIRouter, Depends, HTTPException, Request, Response

from backend.controller.dependencies import admin_user
from backend.controller.schema.members import MemberOutput, MemberUpdateInput
from backend.service.access import AccessDenied, ResourceConflict, ResourceNotFound

router = APIRouter(prefix="/admin/users", tags=["members"])


def fail(error):
    status = 403 if isinstance(error, AccessDenied) else 404 if isinstance(error, ResourceNotFound) else 409
    return HTTPException(status_code=status, detail=str(error))


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
