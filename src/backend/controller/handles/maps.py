from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from backend.controller.dependencies import current_user
from backend.controller.schema.maps import MapsFunnelInput, MapsJobInput, MapsKeyInput
from backend.domain.roles import DEVELOPERS, SALES
from backend.infra.connections.maps import MapsUnavailable
from backend.service.access import AccessDenied
from backend.service.maps import (
    MapsJobNotFound,
    MapsKeyRejected,
    MapsNotConfigured,
    MapsUnauthorized,
)

router = APIRouter(prefix="/maps", tags=["maps"])


def _check(actor):
    # Session only: the panel uses the server's key, so a caller's API key is never involved.
    if actor.status != "approved" or actor.role not in SALES:
        raise HTTPException(status_code=403, detail="Commercial access required")


def _check_key_admin(actor):
    if actor.status != "approved" or actor.role not in DEVELOPERS:
        raise HTTPException(status_code=403, detail="Developer access required")


def _run(call, *args):
    try:
        return call(*args)
    except MapsNotConfigured:
        raise HTTPException(status_code=503, detail="Maps server is not configured") from None
    except MapsKeyRejected:
        raise HTTPException(status_code=400, detail="Maps server rejected this API key") from None
    except MapsUnauthorized:
        raise HTTPException(status_code=502, detail="Maps server rejected the Nexo API key") from None
    except MapsJobNotFound:
        raise HTTPException(status_code=404, detail="Job not found") from None
    except MapsUnavailable:
        raise HTTPException(status_code=503, detail="Maps server unavailable") from None


@router.get("/status")
def status(request: Request, actor=Depends(current_user)):
    _check(actor)
    return request.app.state.services.maps.status()


@router.put("/key")
def save_key(data: MapsKeyInput, request: Request, actor=Depends(current_user)):
    _check_key_admin(actor)
    return _run(request.app.state.services.maps.save_key, actor, data.api_key)


@router.delete("/key")
def clear_key(request: Request, actor=Depends(current_user)):
    _check_key_admin(actor)
    return request.app.state.services.maps.clear_key()


@router.get("/jobs")
def jobs(request: Request, actor=Depends(current_user)):
    _check(actor)
    return _run(request.app.state.services.maps.jobs)


@router.post("/jobs", status_code=201)
def create(data: MapsJobInput, request: Request, actor=Depends(current_user)):
    _check(actor)
    return _run(request.app.state.services.maps.create, data.model_dump(), actor.id)


@router.get("/jobs/{job_id}")
def job(job_id: UUID, request: Request, actor=Depends(current_user)):
    _check(actor)
    return _run(request.app.state.services.maps.job, job_id)


@router.get("/jobs/{job_id}/results")
def results(job_id: UUID, request: Request, actor=Depends(current_user)):
    _check(actor)
    return _run(request.app.state.services.maps.results, job_id)


@router.post("/funnel", status_code=201)
def add_to_funnel(data: MapsFunnelInput, request: Request, actor=Depends(current_user)):
    _check(actor)
    try:
        return request.app.state.services.clients.import_leads(
            actor, data.niche, [lead.model_dump() for lead in data.leads])
    except AccessDenied as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from None


@router.delete("/jobs/{job_id}", status_code=204)
def delete(job_id: UUID, request: Request, actor=Depends(current_user)):
    _check(actor)
    _run(request.app.state.services.maps.delete, job_id)
    return Response(status_code=204)
