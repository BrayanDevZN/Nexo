from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from backend.controller.schema.approvals import ApprovalInput
from backend.service.approvals import ApprovalPermissionError, ApprovalService


def test_notification_targets_principal_admin():
    repos = Mock()
    repos.users.principal_admin.return_value = SimpleNamespace(id="owner", status="approved")
    user = SimpleNamespace(id="member", status="pending", role="member")
    ApprovalService.notify_registration(repos, user)
    repos.notifications.ensure_approval_request.assert_called_once_with(
        recipient_id="owner", requested_user_id="member")


def test_no_admin_leaves_registration_pending_without_notification():
    repos = Mock()
    repos.users.principal_admin.return_value = None
    ApprovalService.notify_registration(repos, SimpleNamespace(status="pending", role="member"))
    repos.notifications.ensure_approval_request.assert_not_called()


@pytest.mark.parametrize("role,status,version", [("member", "approved", 0),
                                                ("admin", "pending", 0),
                                                ("admin", "approved", 1)])
def test_authorization_rechecks_sql_role_status_and_version(role, status, version):
    repos = Mock()
    repos.users.get.return_value = SimpleNamespace(role=role, status=status, session_version=version)
    with pytest.raises(ApprovalPermissionError):
        ApprovalService._authorize(repos, SimpleNamespace(id="owner", session_version=0))


@pytest.mark.parametrize("data", [{"decision": "admin"}, {"decision": "approved", "role": "admin"}])
def test_decision_schema_rejects_privilege_changes(data):
    with pytest.raises(ValueError):
        ApprovalInput(**data)
