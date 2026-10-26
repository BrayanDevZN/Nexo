import logging

from fastapi import APIRouter, HTTPException, Request

from backend.controller.schema.leads import PublicLeadInput

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/public/leads", tags=["public"])


@router.post("", status_code=201)
def create_public_lead(data: PublicLeadInput, request: Request):
    # Always the same answer, so the form cannot be used to find out which phones are already clients.
    if data.website:
        return {"ok": True}
    try:
        request.app.state.services.clients.create_public_lead(
            name=data.name, phone=data.phone, email=data.email, page=data.page,
            origin=data.origin, click_id=data.click_id)
    except LookupError:
        logger.error("Public lead dropped: there is no owner account to receive it")
        raise HTTPException(status_code=503, detail="Lead capture is unavailable") from None
    return {"ok": True}
