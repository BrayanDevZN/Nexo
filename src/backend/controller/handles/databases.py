from fastapi import APIRouter, Depends, HTTPException, Request

from backend.controller.dependencies import current_user
from backend.controller.schema.databases import SqlQueryInput
from backend.domain.roles import DEVELOPERS
from backend.service.access import AccessDenied
from backend.service.databases import QueryRejected

router = APIRouter(prefix="/admin/databases", tags=["databases"])


def _check(actor):
    # Session only: the SQL console is never reachable with a bearer API key.
    if actor.status != "approved" or actor.role not in DEVELOPERS:
        raise HTTPException(status_code=403, detail="Developer access required")


@router.get("")
def instances(request: Request, actor=Depends(current_user)):
    _check(actor)
    try:
        return request.app.state.services.database_admin.instances(actor)
    except AccessDenied:
        raise HTTPException(status_code=403, detail="Developer access required") from None


@router.post("/sqlite/query")
def query(data: SqlQueryInput, request: Request, actor=Depends(current_user)):
    _check(actor)
    try:
        return request.app.state.services.database_admin.query(actor, data.sql)
    except AccessDenied:
        raise HTTPException(status_code=403, detail="Developer access required") from None
    except QueryRejected as error:
        raise HTTPException(status_code=400, detail=str(error)) from None
