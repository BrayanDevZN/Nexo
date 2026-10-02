import asyncio

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile

from backend.controller.dependencies import current_user
from backend.controller.schema.auth import ProfileInput, UserOutput
from backend.domain.photos import PhotoTooLarge, PhotoValidationError
from backend.service.access import AccessDenied, ResourceConflict, ResourceNotFound

router = APIRouter(prefix="/auth/profile", tags=["profile"])


def fail(exc):
    if isinstance(exc, AccessDenied):
        return HTTPException(status_code=403, detail=str(exc))
    if isinstance(exc, ResourceConflict):
        return HTTPException(status_code=409, detail=str(exc))
    if isinstance(exc, PhotoTooLarge):
        return HTTPException(status_code=413, detail=str(exc))
    if isinstance(exc, PhotoValidationError):
        return HTTPException(status_code=400, detail=str(exc))
    return HTTPException(status_code=404, detail=str(exc))


@router.put("", response_model=UserOutput)
def update_profile(data: ProfileInput, request: Request, actor=Depends(current_user)):
    try:
        return request.app.state.services.profiles.update(actor, data.name, data.phone)
    except (AccessDenied, ResourceConflict) as exc:
        raise fail(exc) from None


@router.put("/photo", response_model=UserOutput)
async def upload_photo(request: Request, file: UploadFile = File(), actor=Depends(current_user)):
    try:
        data = await file.read(request.app.state.settings.profile_photo_max_bytes + 1)
        return await asyncio.to_thread(request.app.state.services.profiles.upload, actor, data)
    except (AccessDenied, ResourceConflict, PhotoValidationError) as exc:
        raise fail(exc) from None
    finally:
        await file.close()


@router.get("/photo", responses={200: {"content": {"image/jpeg": {}}}})
def read_photo(request: Request, actor=Depends(current_user)):
    try:
        data = request.app.state.services.profiles.read_photo(actor)
    except (AccessDenied, ResourceNotFound) as exc:
        raise fail(exc) from None
    return Response(content=data, media_type="image/jpeg", headers={"X-Content-Type-Options": "nosniff"})


@router.delete("/photo", status_code=204)
def delete_photo(request: Request, actor=Depends(current_user)):
    try:
        request.app.state.services.profiles.delete_photo(actor)
    except (AccessDenied, ResourceConflict) as exc:
        raise fail(exc) from None
    return Response(status_code=204)
