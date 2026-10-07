from fastapi import APIRouter, Depends, HTTPException, Request

from backend.controller.dependencies import approved_user
from backend.controller.schema.push import PushSubscription, PushUnsubscribe

router = APIRouter(prefix="/push", tags=["push notifications"])


@router.get("/public-key")
def public_key(request: Request, actor=Depends(approved_user)):
    key = request.app.state.settings.vapid_public_key
    if not key:
        raise HTTPException(status_code=503, detail="Push notifications are not configured")
    return {"public_key": key}


@router.post("/subscribe", status_code=204)
def subscribe(data: PushSubscription, request: Request, actor=Depends(approved_user)):
    request.app.state.services.push.subscribe(actor.id, data.model_dump(mode="json"))


@router.delete("/subscribe", status_code=204)
def unsubscribe(data: PushUnsubscribe, request: Request, actor=Depends(approved_user)):
    request.app.state.services.push.unsubscribe(actor.id, str(data.endpoint))
