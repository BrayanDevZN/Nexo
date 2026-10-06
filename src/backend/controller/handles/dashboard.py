from fastapi import APIRouter, Depends, Request

from backend.controller.dependencies import approved_user
from backend.controller.schema.dashboard import DashboardOutput

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardOutput)
def overview(request: Request, actor=Depends(approved_user)):
    return request.app.state.services.dashboard.overview(actor)
