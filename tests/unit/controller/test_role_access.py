from contextlib import contextmanager
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from backend.controller.dependencies import admin_user, commercial_user, developer_user, owner_user
from backend.service.access import AccessDenied
from backend.service.api_keys import ApiKeyAuthenticationError, ApiKeyService


def request_for(role):
    user = SimpleNamespace(id="user", role=role, status="approved", session_version=0)
    services = SimpleNamespace(sessions=SimpleNamespace(authenticate=lambda _token: user))
    app = SimpleNamespace(state=SimpleNamespace(settings=SimpleNamespace(auth_cookie_name="session"),
                                                services=services))
    return Request({"type": "http", "method": "GET", "path": "/", "query_string": b"",
                    "headers": [(b"cookie", b"session=valid")], "app": app})


@pytest.mark.parametrize(("role", "allowed"), [
    ("owner", {"owner", "admin", "dev", "sales"}),
    ("admin", {"admin", "dev", "sales"}),
    ("dev", {"dev"}),
    ("commercial", {"sales"}),
])
def test_role_matrix_blocks_unrelated_areas(role, allowed):
    for name, check in (("owner", owner_user), ("admin", admin_user),
                        ("dev", developer_user), ("sales", commercial_user)):
        if name in allowed:
            assert check(request_for(role)).role == role
        else:
            with pytest.raises(HTTPException) as denied:
                check(request_for(role))
            assert denied.value.status_code == 403


def test_commercial_cannot_manage_api_keys_even_through_service():
    user = SimpleNamespace(role="commercial")
    with pytest.raises(AccessDenied):
        ApiKeyService._developer(user)


@pytest.mark.parametrize(("role", "allowed"), [
    ("owner", {"owner", "admin", "dev", "sales"}),
    ("admin", {"admin", "dev", "sales"}),
    ("dev", {"dev"}),
    ("commercial", {"sales"}),
])
def test_api_key_uses_current_account_role(role, allowed):
    user = SimpleNamespace(id="user", role=role, status="approved", session_version=0)
    key = SimpleNamespace(id="key", user_id="user")
    @contextmanager
    def transaction():
        yield SimpleNamespace(api_keys=SimpleNamespace(active_by_hash=lambda _hash: key),
                              users=SimpleNamespace(for_auth=lambda _id: user))

    service = ApiKeyService(SimpleNamespace(transaction=transaction))
    service._record_access = lambda _id: None
    try:
        services = SimpleNamespace(api_keys=service)
        app = SimpleNamespace(state=SimpleNamespace(settings=SimpleNamespace(auth_cookie_name="session"),
                                                    services=services))
        request = Request({"type": "http", "method": "GET", "path": "/", "query_string": b"",
                           "headers": [(b"authorization", b"Bearer nexo_live_valid")], "app": app})
        for name, check in (("owner", owner_user), ("admin", admin_user),
                            ("dev", developer_user), ("sales", commercial_user)):
            if name in allowed:
                assert check(request).role == role
            else:
                with pytest.raises(HTTPException) as denied:
                    check(request)
                assert denied.value.status_code == 403
    finally:
        service.close()


@pytest.mark.parametrize("status", ["pending", "rejected"])
def test_api_key_rejects_unapproved_owner(status):
    user = SimpleNamespace(role="owner", status=status)
    @contextmanager
    def transaction():
        yield SimpleNamespace(api_keys=SimpleNamespace(active_by_hash=lambda _hash: SimpleNamespace(id="key", user_id="user")),
                              users=SimpleNamespace(for_auth=lambda _id: user))
    service = ApiKeyService(SimpleNamespace(transaction=transaction))
    try:
        with pytest.raises(ApiKeyAuthenticationError):
            service.authenticate("nexo_live_valid")
    finally:
        service.close()
