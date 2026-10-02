from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from backend.controller.schema.health import HealthResponse

router = APIRouter(prefix="/health", tags=["health"])


@router.get("", response_model=HealthResponse)
def health() -> HealthResponse:
    """Liveness only: does not assert database, Redis or SMTP availability."""
    return HealthResponse()


@router.get("/ready")
def readiness(request: Request):
    checks = request.app.state.services.readiness()
    ready = all(checks.values())
    return JSONResponse(
        {"status": "ready" if ready else "unavailable", "checks": checks},
        status_code=200 if ready else 503,
    )
