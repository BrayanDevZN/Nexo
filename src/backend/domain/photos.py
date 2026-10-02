import warnings
from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError


class PhotoValidationError(ValueError):
    pass


class PhotoTooLarge(PhotoValidationError):
    pass


def normalize_photo(data: bytes, *, max_bytes: int, max_pixels: int) -> bytes:
    if len(data) > max_bytes:
        raise PhotoTooLarge("Profile photo exceeds the size limit")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data), formats=["JPEG", "PNG", "WEBP"]) as image:
                if image.width * image.height > max_pixels:
                    raise PhotoTooLarge("Profile photo exceeds the pixel limit")
                if getattr(image, "n_frames", 1) != 1:
                    raise PhotoValidationError("Animated profile photos are not supported")
                image.load()
                oriented = ImageOps.exif_transpose(image)
                oriented.thumbnail((512, 512))
                # Fresh pixels remove EXIF/XMP/ICC and all original metadata.
                clean = Image.new("RGB", oriented.size, "white")
                converted = oriented.convert("RGBA")
                clean.paste(converted, mask=converted.getchannel("A"))
                output = BytesIO()
                clean.save(output, format="JPEG", quality=85, exif=b"", icc_profile=None)
                return output.getvalue()
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise PhotoTooLarge("Profile photo exceeds the pixel limit") from None
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        if isinstance(exc, PhotoValidationError):
            raise
        raise PhotoValidationError("Invalid JPEG, PNG or WebP image") from None
