from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from backend.controller.schema.members import MemberDirectoryOutput, MemberOutput, MemberUpdateInput
from backend.service.access import AccessDenied
from backend.service.members import MemberService


@pytest.mark.parametrize("role,status,version", [("member", "approved", 0),
                                                ("admin", "pending", 0),
                                                ("admin", "approved", 1)])
def test_permissions_use_current_database_values(role, status, version):
    repos = Mock()
    repos.users.get.return_value = SimpleNamespace(role=role, status=status, session_version=version)
    with pytest.raises(AccessDenied):
        MemberService._authorize(repos, SimpleNamespace(id="actor", session_version=0))


@pytest.mark.parametrize("data", [{}, {"role": "owner"}, {"status": "approved"},
                                 {"password_hash": "injection"}, {"email": None},
                                 {"name": " "}, {"phone": "invalid-number"}])
def test_member_schema_rejects_invalid_and_sensitive_fields(data):
    with pytest.raises(ValueError):
        MemberUpdateInput(**data)


def test_optional_phone_can_be_removed_without_other_changes():
    assert MemberUpdateInput(phone=None).model_dump(exclude_unset=True) == {"phone": None}


def test_member_outputs_exclude_passwords_and_private_directory_fields():
    data = {"id": "member", "name": "Ana", "email": "ana@example.com", "phone": "11999999999",
            "role": "member", "status": "approved", "profile_photo": None,
            "password": "secret", "password_hash": "bcrypt-secret", "google_sub": "private",
            "session_version": 12}
    assert MemberDirectoryOutput(**data).model_dump() == {"id": "member", "name": "Ana", "role": "member"}
    assert not {"password", "password_hash", "google_sub", "session_version"} & MemberOutput(**data).model_dump().keys()
