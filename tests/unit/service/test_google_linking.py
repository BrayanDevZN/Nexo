from types import SimpleNamespace
from unittest.mock import MagicMock, Mock

import pytest

from backend.domain.google import GoogleIdentity
from backend.service.auth import RegistrationConflict
from backend.service.google import GoogleAuthService


@pytest.mark.parametrize("password_hash,subject", [(None, None), (None, "existing"), ("bcrypt", "existing")])
def test_resolution_never_adds_password_or_overwrites_google_identity(password_hash, subject):
    manager = MagicMock()
    repos = manager.transaction.return_value.__enter__.return_value
    repos.users.by_google_sub.return_value = None
    repos.users.by_email.return_value = SimpleNamespace(password_hash=password_hash, google_sub=subject)
    service = GoogleAuthService(Mock(), Mock(), Mock(), manager, Mock(), Mock())
    with pytest.raises(RegistrationConflict):
        service._resolve_identity(GoogleIdentity("new-subject", "ana@example.com", "Ana"))
    repos.users.link_google_if_local.assert_not_called()
    service.sessions.issue.assert_not_called()


def test_concurrent_identity_change_does_not_return_a_session():
    manager = MagicMock()
    repos = manager.transaction.return_value.__enter__.return_value
    repos.users.by_google_sub.return_value = None
    repos.users.by_email.return_value = SimpleNamespace(password_hash="bcrypt", google_sub=None)
    repos.users.link_google_if_local.return_value = False
    service = GoogleAuthService(Mock(), Mock(), Mock(), manager, Mock(), Mock())
    with pytest.raises(RegistrationConflict):
        service._resolve_identity(GoogleIdentity("google-subject", "ana@example.com", "Ana"))
    service.flows.save.assert_not_called()
