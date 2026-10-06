from http.cookies import SimpleCookie
from types import SimpleNamespace

from fastapi import Response

from backend.controller.cookies import clear_google_cookie, set_google_cookie


def test_google_profile_cookie_supports_production_cross_site_requests():
    settings = SimpleNamespace(cookie_secure=True, cookie_samesite="none",
                               google_redirect_uri="https://api.example.com/auth/google/callback")
    for name, expected in [("nexo_google_flow", "lax"), ("nexo_google_profile", "none")]:
        response = Response()
        set_google_cookie(response, settings, name, "temporary-grant", 600)
        cookie = SimpleCookie(response.headers["set-cookie"])[name]
        assert cookie["samesite"] == expected
        assert cookie["secure"] and cookie["httponly"]
        assert cookie["path"] == "/auth/google"
        response = Response()
        clear_google_cookie(response, settings, name)
        cleared = SimpleCookie(response.headers["set-cookie"])[name]
        assert cleared["samesite"] == expected
        assert cleared["path"] == cookie["path"]
        assert cleared["max-age"] == "0"


def test_google_cookies_use_browser_facing_proxy_path():
    settings = SimpleNamespace(cookie_secure=True, cookie_samesite="none",
                               google_redirect_uri="https://www.example.com/api/auth/google/callback")
    for name in ["nexo_google_flow", "nexo_google_profile"]:
        response = Response()
        set_google_cookie(response, settings, name, "temporary-grant", 600)
        assert SimpleCookie(response.headers["set-cookie"])[name]["path"] == "/api/auth/google"
        response = Response()
        clear_google_cookie(response, settings, name)
        assert SimpleCookie(response.headers["set-cookie"])[name]["path"] == "/api/auth/google"
