import asyncio
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile

from backend.controller.dependencies import approved_user
from backend.controller.schema.documents import DocumentOutput
from backend.domain.documents import DocumentTooLarge, DocumentValidationError
from backend.service.access import AccessDenied, ResourceNotFound

router = APIRouter(prefix="/documents", tags=["documents"])


def fail(error):
    status = 403 if isinstance(error, AccessDenied) else 413 if isinstance(error, DocumentTooLarge) else 400 if isinstance(error, DocumentValidationError) else 404
    return HTTPException(status_code=status, detail=str(error))


@router.get("", response_model=list[DocumentOutput])
def listing(request: Request, client_id: str | None = Query(default=None, max_length=36), limit: int = Query(default=50, ge=1, le=100),
            offset: int = Query(default=0, ge=0), actor=Depends(approved_user)):
    try:
        return request.app.state.services.documents.list(actor, client_id=client_id, limit=limit, offset=offset)
    except AccessDenied as error:
        raise fail(error) from None


@router.post("", response_model=DocumentOutput, status_code=201)
async def upload(request: Request, file: UploadFile = File(), client_id: str | None = Query(default=None, max_length=36), actor=Depends(approved_user)):
    try:
        data = await file.read(request.app.state.settings.document_max_bytes + 1)
        return await asyncio.to_thread(request.app.state.services.documents.upload, actor, file.filename, data, client_id)
    except (AccessDenied, DocumentValidationError, ResourceNotFound) as error:
        raise fail(error) from None
    finally:
        await file.close()


@router.get("/{identifier}/download")
def download(identifier: str, request: Request, actor=Depends(approved_user)):
    try:
        filename, data = request.app.state.services.documents.download(actor, identifier)
    except (AccessDenied, ResourceNotFound) as error:
        raise fail(error) from None
    return Response(content=data, media_type="application/octet-stream", headers={
        "Content-Disposition": "attachment; filename*=UTF-8''" + quote(filename, safe=""),
        "X-Content-Type-Options": "nosniff"})


@router.delete("/{identifier}", status_code=204)
def delete(identifier: str, request: Request, actor=Depends(approved_user)):
    try:
        request.app.state.services.documents.delete(actor, identifier)
    except (AccessDenied, ResourceNotFound) as error:
        raise fail(error) from None
    return Response(status_code=204)
