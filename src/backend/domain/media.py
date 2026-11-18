from pathlib import PurePath

from backend.domain.documents import DocumentTooLarge, DocumentValidationError
from backend.domain.photos import normalize_photo

MAX_MEDIA_PER_AUTOMATION = 12
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def validate_media(filename, data: bytes, *, max_image_bytes: int, max_video_bytes: int, max_pixels: int):
    """Return (kind, content_type, safe_name, bytes) for an image or an MP4 upload."""
    name = str(filename or "").replace("\\", "/").split("/")[-1].strip()
    suffix = PurePath(name).suffix.lower()
    if not name or len(name) > 180 or not data:
        raise DocumentValidationError("Unsupported or empty media file")
    if suffix == ".mp4":
        if len(data) > max_video_bytes:
            raise DocumentTooLarge("Video exceeds upload limit")
        if data[4:8] != b"ftyp":
            raise DocumentValidationError("Invalid MP4 video")
        return "video", "video/mp4", name, data
    if suffix in IMAGE_EXTENSIONS:
        cleaned = normalize_photo(data, max_bytes=max_image_bytes, max_pixels=max_pixels, max_side=1920)
        return "image", "image/jpeg", name, cleaned
    raise DocumentValidationError("Only JPEG, PNG, WebP images and MP4 videos are supported")
