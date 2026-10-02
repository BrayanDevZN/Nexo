from unittest.mock import Mock

from backend.service.rate_limits import RateLimitService


def test_global_shared_route_separate_and_sensitive_group(settings):
    service = RateLimitService(Mock(), settings, "test:rate")
    first = service.budgets("private-peer", "POST", "/auth/login")
    register = service.budgets("private-peer", "POST", "/auth/register")
    other_peer = service.budgets("other-peer", "POST", "/auth/login")
    assert len(first) == 3
    assert first[0] == other_peer[0]
    assert first[1].key != register[1].key
    assert first[2].key == register[2].key
    assert first[2].key != other_peer[2].key
    assert all("private-peer" not in budget.key for budget in first)
    assert len(service.budgets("private-peer", "GET", "/auth/me")) == 2
    assert len(service.budgets("private-peer", "GET", "/auth/google/callback")) == 3


def test_settings_limits_and_windows_are_used(settings):
    settings.global_rate_limit = 11
    settings.global_rate_limit_window_seconds = 12
    settings.rate_limit = 13
    settings.rate_limit_window_seconds = 14
    settings.auth_rate_limit = 15
    settings.auth_rate_limit_window_seconds = 16
    budgets = RateLimitService(Mock(), settings, "test:rate").budgets("peer", "POST", "/auth/login")
    assert [(b.limit, b.window_seconds) for b in budgets] == [(11, 12), (13, 14), (15, 16)]
