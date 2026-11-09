from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from backend.controller.dependencies import commercial_user
from backend.controller.schema.paid_leads import PaidLeadOutput, PaidLeadPatch
from backend.domain.paid_leads import PaidLeadStage
from backend.service.access import AccessDenied, ResourceNotFound

router = APIRouter(prefix="/paid-leads", tags=["paid-leads"])


def fail(exc):
    return HTTPException(status_code=403 if isinstance(exc, AccessDenied) else 404, detail=str(exc))


@router.get("", response_model=list[PaidLeadOutput])
def list_paid_leads(request: Request, stage: PaidLeadStage | None = None, limit: int = Query(default=50, ge=1, le=100),
                    offset: int = Query(default=0, ge=0), actor=Depends(commercial_user)):
    try:
        return request.app.state.services.paid_leads.list(actor, stage=stage, limit=limit, offset=offset)
    except AccessDenied as exc:
        raise fail(exc) from None


@router.patch("/{identifier}", response_model=PaidLeadOutput)
def update_paid_lead(identifier: str, data: PaidLeadPatch, request: Request, actor=Depends(commercial_user)):
    try:
        return request.app.state.services.paid_leads.update(actor, identifier, **data.model_dump(exclude_unset=True))
    except (AccessDenied, ResourceNotFound) as exc:
        raise fail(exc) from None


@router.delete("/{identifier}", status_code=204)
def delete_paid_lead(identifier: str, request: Request, actor=Depends(commercial_user)):
    try:
        request.app.state.services.paid_leads.delete(actor, identifier)
    except (AccessDenied, ResourceNotFound) as exc:
        raise fail(exc) from None
    return Response(status_code=204)
