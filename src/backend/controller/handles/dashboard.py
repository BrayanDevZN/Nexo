from fastapi import APIRouter, Depends, Request

from backend.controller.dependencies import commercial_user
from backend.controller.schema.dashboard import DashboardOutput

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardOutput)
def overview(request: Request, actor=Depends(commercial_user)):
    return request.app.state.services.dashboard.overview(actor)

