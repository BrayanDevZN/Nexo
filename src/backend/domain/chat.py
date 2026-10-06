from backend.domain.photos import normalize_photo


class ChatMediaError(ValueError):
    pass


class ChatMediaTooLarge(ChatMediaError):
    pass


def normalize_media(kind, media_type, data, settings):
    if not data:
        raise ChatMediaError("Empty media")
    if len(data) > settings.chat_media_max_bytes:
        raise ChatMediaTooLarge("Chat media exceeds size limit")
    if kind == "image":
        return normalize_photo(data, max_bytes=settings.chat_media_max_bytes,
                               max_pixels=settings.profile_photo_max_pixels), "image/jpeg"
    if kind != "audio":
        raise ChatMediaError("Invalid media kind")
    # Browser recorder produces WebM/Ogg. Uploaded MP3/WAV/M4A are also supported.
    signatures = {
        "audio/webm": data.startswith(b'\x1aE\xdf\xa3'),
        "audio/ogg": data.startswith(b'OggS'),
        "audio/wav": data.startswith(b'RIFF') and data[8:12] == b'WAVE',
        "audio/mpeg": data.startswith(b'ID3') or (len(data) > 1 and data[0] == 255 and data[1] & 224 == 224),
        "audio/mp4": len(data) > 12 and data[4:8] == b'ftyp',
    }
    media_type = media_type.split(';')[0].strip().lower()
    if not signatures.get(media_type):
        raise ChatMediaError("Invalid or unsupported audio")
    return data, media_type
