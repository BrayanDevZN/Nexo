from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile
from pydantic import ValidationError

from backend.controller.dependencies import approved_user
from backend.controller.schema.automations import AutomationOutput
from backend.domain.documents import DocumentTooLarge, DocumentValidationError, validate_document
from backend.domain.photos import PhotoTooLarge, PhotoValidationError, normalize_photo
from backend.service.access import AccessDenied, ResourceNotFound

router = APIRouter(prefix="/automations", tags=["automations"])


@router.get("", response_model=list[AutomationOutput])
def listing(request: Request, limit: int = Query(default=50, ge=1, le=100),
            offset: int = Query(default=0, ge=0), actor=Depends(approved_user)):
    try:
        return request.app.state.services.automations.list(actor, limit=limit, offset=offset)
    except AccessDenied as error:
        raise HTTPException(status_code=403, detail=str(error)) from None


@router.get("/{identifier}", response_model=AutomationOutput)
def get_automation(identifier: str, request: Request, actor=Depends(approved_user)):
    try:
        return request.app.state.services.automations.get(actor, identifier)
    except AccessDenied as error:
        raise HTTPException(status_code=403, detail=str(error)) from None
    except ResourceNotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from None


@router.post("", response_model=AutomationOutput, status_code=201)
async def create(request: Request, name: str = Form(min_length=1, max_length=120),
                 description: str = Form(min_length=1, max_length=5000),
                 file: UploadFile = File(), image: UploadFile | None = File(default=None),
                 actor=Depends(approved_user)):
    try:
        if not name.strip() or not description.strip():
            raise HTTPException(status_code=422, detail="Name and description cannot be empty")
        raw = await file.read(request.app.state.settings.document_max_bytes + 1)
        filename = validate_document(file.filename, raw, request.app.state.settings.document_max_bytes)
        image_data = None
        if image is not None:
            image_data = normalize_photo(await image.read(request.app.state.settings.profile_photo_max_bytes + 1),
                                         max_bytes=request.app.state.settings.profile_photo_max_bytes,
                                         max_pixels=request.app.state.settings.profile_photo_max_pixels)
        return request.app.state.services.automations.create(
            actor, name=name.strip(), description=description.strip(), filename=filename,
            file_content=raw, image_data=image_data,
        )
    except DocumentTooLarge as error:
        raise HTTPException(status_code=413, detail=str(error)) from None
    except PhotoTooLarge as error:
        raise HTTPException(status_code=413, detail=str(error)) from None
    except (DocumentValidationError, PhotoValidationError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from None
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=error.errors(include_input=False)) from None
    except AccessDenied as error:
        raise HTTPException(status_code=403, detail=str(error)) from None
    finally:
        await file.close()
        if image is not None:
            await image.close()


@router.get("/{identifier}/download")
def download(identifier: str, request: Request, actor=Depends(approved_user)):
    try:
        filename, data = request.app.state.services.automations.download(actor, identifier)
    except AccessDenied as error:
        raise HTTPException(status_code=403, detail=str(error)) from None
    except ResourceNotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from None
    return Response(content=data, media_type="application/octet-stream", headers={
        "Content-Disposition": "attachment; filename*=UTF-8''" + quote(filename, safe=""),
        "X-Content-Type-Options": "nosniff"})


@router.get("/{identifier}/image")
def image(identifier: str, request: Request, actor=Depends(approved_user)):
    try:
        data = request.app.state.services.automations.image(actor, identifier)
    except AccessDenied as error:
        raise HTTPException(status_code=403, detail=str(error)) from None
    except ResourceNotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from None
    return Response(content=data, media_type="image/jpeg", headers={"Cache-Control": "no-store"})
