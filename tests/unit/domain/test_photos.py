from io import BytesIO

import pytest
from PIL import Image
from PIL.PngImagePlugin import PngInfo

from backend.domain.photos import PhotoTooLarge, PhotoValidationError, normalize_photo


def picture():
    output = BytesIO()
    metadata = PngInfo()
    metadata.add_text("private", "private-metadata-sentinel")
    Image.new("RGBA", (700, 350), (255, 0, 0, 100)).save(output, "PNG", pnginfo=metadata)
    return output.getvalue()


def test_image_is_resized_reencoded_and_metadata_removed():
    result = normalize_photo(picture(), max_bytes=100000, max_pixels=1000000)
    assert b"private-metadata-sentinel" not in result
    with Image.open(BytesIO(result)) as image:
        assert image.format == "JPEG" and image.size == (512, 256)
        assert not image.getexif()


@pytest.mark.parametrize("data", [b"<svg><script>bad()</script></svg>", b"not-an-image", b""])
def test_invalid_or_active_content_is_rejected(data):
    with pytest.raises(PhotoValidationError):
        normalize_photo(data, max_bytes=100000, max_pixels=1000000)


def test_limits_apply_before_full_image_decode():
    with pytest.raises(PhotoTooLarge):
        normalize_photo(picture(), max_bytes=10, max_pixels=1000000)
    with pytest.raises(PhotoTooLarge):
        normalize_photo(picture(), max_bytes=100000, max_pixels=100)
