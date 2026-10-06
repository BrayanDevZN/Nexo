from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from backend.controller.schema.members import MemberUpdateInput
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
