import logging

from fastapi import APIRouter, Path, Request

from backend.controller.schema.paid_leads import PublicClickInput, PublicVisitInput

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/public/paid-leads", tags=["public"])
UUID = r"^[0-9a-fA-F-]{36}$"


@router.post("/visit", status_code=201)
def record_visit(data: PublicVisitInput, request: Request):
    # `id` is null for traffic that did not come from an ad: nothing is stored for it.
    return {"id": request.app.state.services.paid_leads.record_visit(
        page=data.page, source=data.origin, click_id=data.click_id)}


@router.post("/{lead_id}/whatsapp", status_code=201)
def record_whatsapp_click(data: PublicClickInput, request: Request, lead_id: str = Path(pattern=UUID)):
    # Same answer whether or not the id exists, so ids cannot be probed.
    request.app.state.services.paid_leads.record_whatsapp_click(lead_id, data.placement)
    return {"ok": True}
