from contextlib import contextmanager
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from backend.controller.dependencies import admin_user, commercial_user, developer_user, owner_user
from backend.domain.roles import key_allows
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


def test_every_approved_role_can_hold_api_keys_but_unknown_roles_cannot():
    for role in ("owner", "admin", "dev", "commercial"):
        assert ApiKeyService._holder(SimpleNamespace(role=role)).role == role
    with pytest.raises(AccessDenied):
        ApiKeyService._holder(SimpleNamespace(role="member"))


@pytest.mark.parametrize(("role", "path", "allowed"), [
    ("commercial", "/clients", True), ("commercial", "/clients/abc", True),
    ("commercial", "/auth/api-keys/validate", True),
    ("commercial", "/videos", True), ("commercial", "/videos/generate", True), ("commercial", "/videos/abc/file", True),
    ("commercial", "/videosx", False), ("commercial", "/clientsx", False), ("commercial", "/automations", False), ("commercial", "/documents", False),
    ("commercial", "/dashboard", False), ("commercial", "/notifications", False), ("commercial", "/announcements", False),
    ("dev", "/automations", True), ("admin", "/documents", True), ("owner", "/announcements", True),
])
def test_commercial_keys_only_reach_clients_videos_and_the_maps_key_check(role, path, allowed):
    assert key_allows(SimpleNamespace(role=role), path) is allowed


@pytest.mark.parametrize(("role", "allowed"), [
    ("owner", {"owner", "admin", "dev", "sales"}),
    ("admin", {"admin", "dev", "sales"}),
    ("dev", {"dev"}),
    ("commercial", set()),  # a commercial key is limited to /clients, so the root path is refused
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


@pytest.mark.parametrize(("role", "status"), [
    ("owner", "pending"), ("owner", "rejected"), ("commercial", "pending"), ("member", "approved"),
])
def test_api_key_rejects_unapproved_or_unknown_role_account(role, status):
    user = SimpleNamespace(role=role, status=status)
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


def test_commercial_key_works_on_clients_routes_and_is_refused_elsewhere():
    user = SimpleNamespace(id="user", role="commercial", status="approved", session_version=0)
    @contextmanager
    def transaction():
        yield SimpleNamespace(api_keys=SimpleNamespace(active_by_hash=lambda _hash: SimpleNamespace(id="key", user_id="user")),
                              users=SimpleNamespace(for_auth=lambda _id: user))
    service = ApiKeyService(SimpleNamespace(transaction=transaction))
    service._record_access = lambda _id: None
    try:
        app = SimpleNamespace(state=SimpleNamespace(settings=SimpleNamespace(auth_cookie_name="session"),
                                                    services=SimpleNamespace(api_keys=service)))
        def call(path, check):
            request = Request({"type": "http", "method": "GET", "path": path, "query_string": b"",
                               "headers": [(b"authorization", b"Bearer nexo_live_valid")], "app": app})
            return check(request)
        assert call("/clients", commercial_user).role == "commercial"
        with pytest.raises(HTTPException) as denied:
            call("/documents", commercial_user)
        assert denied.value.status_code == 403
    finally:
        service.close()
