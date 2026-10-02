from unittest.mock import Mock

import pytest

from backend.repository.db.control.base import pagination
from backend.repository.db.control.clients import ClientRepository
from backend.repository.db.control.notifications import NotificationRepository
from backend.repository.db.control.users import UserRepository


@pytest.mark.parametrize("limit,offset", [(0, 0), (101, 0), (1, -1)])
def test_rejects_invalid_pagination(limit, offset):
    with pytest.raises(ValueError):
        pagination(limit, offset)


def test_normalizes_email_and_does_not_commit():
    session = Mock()
    repository = UserRepository(session)
    row = repository.create(name=" Brayan ", email=" ADMIN@Example.com ", password_hash="hash")
    assert row.email == "admin@example.com"
    assert row.name == "Brayan"
    assert row.status == "pending" and row.role == "member"
    session.flush.assert_called_once()
    session.commit.assert_not_called()


def test_client_update_rejects_ownership_changes():
    with pytest.raises(ValueError):
        ClientRepository(Mock()).update(Mock(), created_by_id="other")


def test_notification_cannot_be_resolved_twice():
    row = Mock(resolved_at=object())
    with pytest.raises(ValueError, match="already resolved"):
        NotificationRepository(Mock()).resolve(row, "approved")
