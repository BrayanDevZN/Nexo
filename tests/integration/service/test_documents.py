# ruff: noqa: F811
from unittest.mock import patch

import pytest

from backend.service.access import AccessDenied
from tests.integration.service.test_members import owner, registered, runtime  # noqa: F401


def test_documents_cache_permissions_transfer_and_cleanup(runtime):
    admin = owner(runtime)
    member, _ = registered(runtime)
    doc = runtime.documents.upload(member, 'contrato.txt', b'Contrato')
    assert runtime.documents.list(admin)[0]['created_by_name'] == 'Ana'
    assert 'storage_key' not in runtime.documents.list(admin)[0]
    assert runtime.documents.download(admin, doc['id']) == ('contrato.txt', b'Contrato')
    admin_doc = runtime.documents.upload(admin, 'admin.txt', b'Admin')
    assert len(runtime.documents.list(member)) == 2  # invalidated cached listing
    with pytest.raises(AccessDenied):
        runtime.documents.delete(member, admin_doc['id'])
    runtime.members.delete(admin, member.id)
    assert runtime.documents.download(admin, doc['id'])[1] == b'Contrato'
    assert next(row for row in runtime.documents.list(admin) if row['id'] == doc['id'])['created_by_id'] == admin.id
    runtime.documents.delete(admin, doc['id'])
    runtime.documents.delete(admin, admin_doc['id'])
    assert runtime.documents.list(admin) == []
    assert list(runtime.documents.storage.root.iterdir()) == []


def test_document_upload_rollback_removes_file_and_pending_is_denied(runtime):
    admin = owner(runtime)
    with patch('backend.repository.db.control.documents.DocumentRepository.create', side_effect=RuntimeError):
        with pytest.raises(RuntimeError):
            runtime.documents.upload(admin, 'test.txt', b'x')
    assert list(runtime.documents.storage.root.iterdir()) == []
    member, _ = registered(runtime, approved=False)
    with pytest.raises(AccessDenied):
        runtime.documents.upload(member, 'test.txt', b'x')
    assert runtime.documents.list(admin) == []
