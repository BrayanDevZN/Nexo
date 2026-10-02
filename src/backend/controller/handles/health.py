from fastapi import APIRouter

from backend.controller.schema.health import HealthResponse

router = APIRouter(prefix="/health", tags=["health"])


@router.get("", response_model=HealthResponse)
def health() -> HealthResponse:
    """Liveness only: does not assert database, Redis or SMTP availability."""
    return HealthResponse()
