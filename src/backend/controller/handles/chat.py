import asyncio
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
)

from backend.controller.dependencies import approved_user
from backend.controller.schema.chat import ChatMessageOutput
from backend.domain.chat import ChatMediaError, ChatMediaTooLarge
from backend.domain.photos import PhotoTooLarge, PhotoValidationError
from backend.service.access import AccessDenied, ResourceConflict, ResourceNotFound

router = APIRouter(prefix="/chat", tags=["chat"])


def fail(error):
    status = (403 if isinstance(error, AccessDenied) else 404 if isinstance(error, ResourceNotFound)
              else 409 if isinstance(error, ResourceConflict)
              else 413 if isinstance(error, (ChatMediaTooLarge, PhotoTooLarge)) else 400)
    return HTTPException(status_code=status, detail=str(error))


@router.get("/{member_id}/messages", response_model=list[ChatMessageOutput])
def history(member_id: UUID, request: Request, before: int | None = Query(default=None, ge=1),
            limit: int = Query(default=50, ge=1, le=100), actor=Depends(approved_user)):
    try:
        return request.app.state.services.chat.history(actor, str(member_id), before=before, limit=limit)
    except (AccessDenied, ResourceNotFound) as error:
        raise fail(error) from None


@router.post("/{member_id}/media", response_model=ChatMessageOutput, status_code=201)
async def upload(member_id: UUID, request: Request, file: UploadFile = File(),
                 client_id: UUID = Form(), kind: str = Form(), actor=Depends(approved_user)):
    try:
        data = await file.read(request.app.state.settings.chat_media_max_bytes + 1)
        return await asyncio.to_thread(request.app.state.services.chat.upload, actor, str(member_id),
                                       str(client_id), kind, file.content_type or "", data)
    except (AccessDenied, ResourceNotFound, ResourceConflict, ChatMediaError, PhotoValidationError) as error:
        raise fail(error) from None
    finally:
        await file.close()


@router.get("/media/{identifier}")
def media(identifier: UUID, request: Request, actor=Depends(approved_user)):
    try:
        data, media_type = request.app.state.services.chat.media(actor, str(identifier))
    except (AccessDenied, ResourceNotFound) as error:
        raise fail(error) from None
    return Response(content=data, media_type=media_type, headers={"X-Content-Type-Options": "nosniff"})
