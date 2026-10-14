from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, HttpUrl

from backend.controller.dependencies import approved_user

router = APIRouter(prefix="/event-subscriptions", tags=["event-subscriptions"])


class SubscriptionCreate(BaseModel):
    event: str
    webhook_url: HttpUrl


@router.post("", status_code=201)
def create_subscription(data: SubscriptionCreate, request: Request, actor=Depends(approved_user)):
    try:
        return request.app.state.services.webhook_events.subscribe(
            actor.id, data.event, str(data.webhook_url)
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None


@router.delete("/{identifier}", status_code=204)
def delete_subscription(identifier: str, request: Request, actor=Depends(approved_user)):
    if not request.app.state.services.webhook_events.unsubscribe(actor.id, identifier):
        raise HTTPException(status_code=404, detail="Subscription not found")
    return Response(status_code=204)
