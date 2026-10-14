from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from backend.controller.schema.members import MemberDirectoryOutput, MemberOutput, MemberUpdateInput
from backend.service.access import AccessDenied, ResourceConflict
from backend.service.members import MemberService


@pytest.mark.parametrize("role,status,version", [("member", "approved", 0),
                                                ("admin", "pending", 0),
                                                ("admin", "approved", 1)])
def test_permissions_use_current_database_values(role, status, version):
    repos = Mock()
    repos.users.get.return_value = SimpleNamespace(role=role, status=status, session_version=version)
    with pytest.raises(AccessDenied):
        MemberService._authorize(repos, SimpleNamespace(id="actor", session_version=0))


@pytest.mark.parametrize("data", [{}, {"role": "root"}, {"status": "approved"},
                                 {"password_hash": "injection"}, {"email": None},
                                 {"name": " "}, {"phone": "invalid-number"}])
def test_member_schema_rejects_invalid_and_sensitive_fields(data):
    with pytest.raises(ValueError):
        MemberUpdateInput(**data)


def test_owner_role_is_valid_for_member_updates():
    assert MemberUpdateInput(role="owner").role == "owner"


def test_only_principal_can_assign_or_remove_another_owner_role():
    principal = SimpleNamespace(id="principal", name="Principal", email="owner@example.com",
                                phone=None, profile_photo=None, status="approved", role="owner",
                                session_version=0, created_at=None, updated_at=None)
    other = SimpleNamespace(id="other", name="Other", email="other@example.com",
                            phone=None, profile_photo=None, status="approved", role="admin",
                            session_version=0, created_at=None, updated_at=None)
    users = {principal.id: principal, other.id: other}
    repository = SimpleNamespace(get=users.get, principal_admin=lambda: principal)
    def update(user, changes):
        for field, value in changes.items():
            setattr(user, field, value)
        return True
    repository.update_member_if_current = update
    @contextmanager
    def transaction():
        yield SimpleNamespace(users=repository)
    service = MemberService(SimpleNamespace(transaction=transaction), None, None)

    assert service.update(principal, other.id, {"role": "owner"})["role"] == "owner"
    with pytest.raises(AccessDenied):
        service.update(other, principal.id, {"role": "admin"})
    with pytest.raises(ResourceConflict):
        service.update(other, other.id, {"role": "dev"})
    with pytest.raises(ResourceConflict):
        service.update(principal, principal.id, {"role": "commercial"})
    assert service.update(principal, other.id, {"role": "dev"})["role"] == "dev"


def test_optional_phone_can_be_removed_without_other_changes():
    assert MemberUpdateInput(phone=None).model_dump(exclude_unset=True) == {"phone": None}


def test_member_outputs_exclude_passwords_and_private_directory_fields():
    data = {"id": "member", "name": "Ana", "email": "ana@example.com", "phone": "11999999999",
            "role": "commercial", "status": "approved", "profile_photo": None,
            "password": "secret", "password_hash": "bcrypt-secret", "google_sub": "private",
            "session_version": 12}
    assert MemberDirectoryOutput(**data).model_dump() == {"id": "member", "name": "Ana", "role": "commercial", "has_photo": False, "online": False}
    assert not {"password", "password_hash", "google_sub", "session_version"} & MemberOutput(**data).model_dump().keys()

