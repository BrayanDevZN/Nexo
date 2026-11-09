from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse

from backend.controller.dependencies import commercial_user
from backend.controller.schema.videos import VideoCreateInput, VideoGenerateInput
from backend.service.access import AccessDenied, ResourceConflict, ResourceNotFound
from backend.service.videos import VideoGeneratorNotConfigured, VideosNotConfigured

# Session or Nexo API key, like the other routes; only owner, admin and commercial members (commercial_user).
router = APIRouter(prefix="/videos", tags=["videos"])


def _run(call, *args, **kwargs):
    try:
        return call(*args, **kwargs)
    except VideosNotConfigured:
        raise HTTPException(status_code=503, detail="Video server is not configured") from None
    except VideoGeneratorNotConfigured:
        raise HTTPException(status_code=503, detail="Video generator is not configured") from None
    except ResourceConflict as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from None
    except ResourceNotFound:
        raise HTTPException(status_code=404, detail="Video not found") from None
    except AccessDenied:
        raise HTTPException(status_code=403, detail="Commercial access required") from None
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None


@router.get("")
def listing(request: Request, actor=Depends(commercial_user)):
    """The latest videos of whoever is calling, newest first."""
    return _run(request.app.state.services.videos.list, actor)


@router.post("", status_code=202)
def create(data: VideoCreateInput, request: Request, actor=Depends(commercial_user)):
    """Render a video from an HTML composition. Answers at once; poll GET /videos/{id}."""
    return _run(request.app.state.services.videos.create, actor, **data.model_dump())


@router.post("/generate", status_code=202)
def generate(data: VideoGenerateInput, request: Request, actor=Depends(commercial_user)):
    """Describe the video; the AI writes the HTML and it is rendered. Answers at once; poll GET /videos/{id}."""
    return _run(request.app.state.services.videos.generate, actor, **data.model_dump())


@router.get("/{video_id}")
def status(video_id: UUID, request: Request, actor=Depends(commercial_user)):
    return _run(request.app.state.services.videos.get, actor, str(video_id))


@router.get("/{video_id}/file")
def file(video_id: UUID, request: Request, actor=Depends(commercial_user)):
    path = _run(request.app.state.services.videos.file, actor, str(video_id))
    return FileResponse(path, media_type="video/mp4", filename=f"video-{video_id}.mp4")
