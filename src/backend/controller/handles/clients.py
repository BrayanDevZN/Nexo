from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from backend.controller.dependencies import approved_user
from backend.controller.schema.clients import ClientCreate, ClientOutput, ClientPatch, PipelineStage
from backend.service.access import AccessDenied, ResourceNotFound

router = APIRouter(prefix="/clients", tags=["clients"])


def fail(exc):
    return HTTPException(status_code=403 if isinstance(exc, AccessDenied) else 404, detail=str(exc))


@router.get("", response_model=list[ClientOutput])
def list_clients(request: Request, niche: str | None = Query(default=None, max_length=120),
                 name: str | None = Query(default=None, max_length=160),
                 created_by_id: str | None = Query(default=None, max_length=36),
                 pipeline_stage: PipelineStage | None = None,
                 contract_closed: bool | None = None, limit: int = Query(default=50, ge=1, le=100),
                 offset: int = Query(default=0, ge=0), actor=Depends(approved_user)):
    try:
        return request.app.state.services.clients.list(actor, niche=niche, name=name, created_by_id=created_by_id,
                                                       pipeline_stage=pipeline_stage, contract_closed=contract_closed,
                                                       limit=limit, offset=offset)
    except AccessDenied as exc:
        raise fail(exc) from None


@router.get("/{identifier}", response_model=ClientOutput)
def get_client(identifier: str, request: Request, actor=Depends(approved_user)):
    try:
        return request.app.state.services.clients.get(actor, identifier)
    except (AccessDenied, ResourceNotFound) as exc:
        raise fail(exc) from None


@router.post("", response_model=ClientOutput, status_code=201)
def create_client(data: ClientCreate, request: Request, actor=Depends(approved_user)):
    try:
        return request.app.state.services.clients.create(actor, **data.model_dump(mode="json"))
    except AccessDenied as exc:
        raise fail(exc) from None


@router.patch("/{identifier}", response_model=ClientOutput)
def update_client(identifier: str, data: ClientPatch, request: Request, actor=Depends(approved_user)):
    try:
        return request.app.state.services.clients.update(actor, identifier,
                                                        **data.model_dump(mode="json", exclude_unset=True))
    except (AccessDenied, ResourceNotFound) as exc:
        raise fail(exc) from None


@router.delete("/{identifier}", status_code=204)
def delete_client(identifier: str, request: Request, actor=Depends(approved_user)):
    try:
        request.app.state.services.clients.delete(actor, identifier)
    except (AccessDenied, ResourceNotFound) as exc:
        raise fail(exc) from None
    return Response(status_code=204)
