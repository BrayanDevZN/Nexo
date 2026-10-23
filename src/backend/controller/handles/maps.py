from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from backend.controller.dependencies import current_user
from backend.controller.schema.maps import MapsJobInput
from backend.domain.roles import SALES
from backend.infra.connections.maps import MapsUnavailable
from backend.service.maps import MapsJobNotFound, MapsNotConfigured, MapsUnauthorized

router = APIRouter(prefix="/maps", tags=["maps"])


def _check(actor):
    # Session only: the panel uses the server's key, so a caller's API key is never involved.
    if actor.status != "approved" or actor.role not in SALES:
        raise HTTPException(status_code=403, detail="Commercial access required")


def _run(call, *args):
    try:
        return call(*args)
    except MapsNotConfigured:
        raise HTTPException(status_code=503, detail="Maps server is not configured") from None
    except MapsUnauthorized:
        raise HTTPException(status_code=502, detail="Maps server rejected the Nexo API key") from None
    except MapsJobNotFound:
        raise HTTPException(status_code=404, detail="Job not found") from None
    except MapsUnavailable:
        raise HTTPException(status_code=503, detail="Maps server unavailable") from None


@router.get("/jobs")
def jobs(request: Request, actor=Depends(current_user)):
    _check(actor)
    return _run(request.app.state.services.maps.jobs)


@router.post("/jobs", status_code=201)
def create(data: MapsJobInput, request: Request, actor=Depends(current_user)):
    _check(actor)
    return _run(request.app.state.services.maps.create, data.model_dump())


@router.get("/jobs/{job_id}")
def job(job_id: UUID, request: Request, actor=Depends(current_user)):
    _check(actor)
    return _run(request.app.state.services.maps.job, job_id)


@router.get("/jobs/{job_id}/results")
def results(job_id: UUID, request: Request, actor=Depends(current_user)):
    _check(actor)
    return _run(request.app.state.services.maps.results, job_id)


@router.delete("/jobs/{job_id}", status_code=204)
def delete(job_id: UUID, request: Request, actor=Depends(current_user)):
    _check(actor)
    _run(request.app.state.services.maps.delete, job_id)
    return Response(status_code=204)
