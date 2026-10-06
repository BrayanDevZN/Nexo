import pytest

from backend.domain.documents import DocumentTooLarge, DocumentValidationError, validate_document
from backend.infra.connections.documents import DocumentStorage


def test_document_validation_and_private_storage(tmp_path):
    assert validate_document('../../contrato.pdf', b'data', 10) == 'contrato.pdf'
    for name, data in [('script.html', b'x'), ('test.txt', b''), ('bad\n.txt', b'x')]:
        with pytest.raises(DocumentValidationError):
            validate_document(name, data, 10)
    with pytest.raises(DocumentTooLarge):
        validate_document('large.pdf', b'x' * 11, 10)
    storage = DocumentStorage(tmp_path)
    key = storage.write(b'secret')
    assert storage.read(key) == b'secret'
    assert storage.path(key).stat().st_mode & 0o777 == 0o600
    with pytest.raises(FileNotFoundError):
        storage.read('../../file')
    storage.delete(key)
    with pytest.raises(FileNotFoundError):
        storage.read(key)
