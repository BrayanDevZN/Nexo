from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from backend.controller.dependencies import current_user
from backend.controller.schema.api_keys import ApiKeyCreatedOutput, ApiKeyCreateInput, ApiKeyOutput
from backend.service.access import AccessDenied, ResourceNotFound

router = APIRouter(prefix="/auth/api-keys", tags=["api keys"])


@router.get("", response_model=list[ApiKeyOutput])
def listing(request: Request, actor=Depends(current_user)):
    if actor.status != "approved":
        raise HTTPException(status_code=403, detail="Account awaiting approval")
    return request.app.state.services.api_keys.list(actor)


@router.post("", response_model=ApiKeyCreatedOutput, status_code=201)
def create(data: ApiKeyCreateInput, request: Request, actor=Depends(current_user)):
    if actor.status != "approved":
        raise HTTPException(status_code=403, detail="Account awaiting approval")
    try:
        metadata, secret = request.app.state.services.api_keys.create(actor, data.name)
        return {**metadata, "key": secret}
    except (AccessDenied, ValueError) as error:
        raise HTTPException(status_code=403, detail=str(error)) from None


@router.get("/usage")
def usage(request: Request, days: int = Query(default=30, ge=7, le=90), actor=Depends(current_user)):
    if actor.status != "approved":
        raise HTTPException(status_code=403, detail="Account awaiting approval")
    return request.app.state.services.api_keys.usage(actor, days)


@router.delete("/{identifier}", status_code=204)
def revoke(identifier: str, request: Request, actor=Depends(current_user)):
    if actor.status != "approved":
        raise HTTPException(status_code=403, detail="Account awaiting approval")
    try:
        request.app.state.services.api_keys.revoke(actor, identifier)
    except ResourceNotFound:
        raise HTTPException(status_code=404, detail="API key not found") from None
    return Response(status_code=204)
