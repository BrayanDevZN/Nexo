import re
from pathlib import PurePath


class DocumentValidationError(ValueError):
    pass


class DocumentTooLarge(DocumentValidationError):
    pass


EXTENSIONS = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv", ".odt", ".ods", ".rtf"}


def validate_document(filename, data, max_bytes):
    name = str(filename or "").replace("\\", "/").split("/")[-1].strip()
    if len(data) > max_bytes:
        raise DocumentTooLarge("Document exceeds upload limit")
    if (not name or len(name) > 180 or re.search(r"[\x00-\x1f\x7f]", name)
            or PurePath(name).suffix.lower() not in EXTENSIONS or not data):
        raise DocumentValidationError("Unsupported or empty document")
    return name
