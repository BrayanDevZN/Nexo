def set_session_cookie(response, settings, token):
    response.set_cookie(settings.auth_cookie_name, token, httponly=True,
                        secure=settings.cookie_secure, samesite=settings.cookie_samesite,
                        path="/", max_age=settings.jwt_expire_minutes * 60)


def set_google_cookie(response, settings, name, value, ttl):
    # Lax permits the top-level Google callback even if auth uses Strict.
    response.set_cookie(name, value, max_age=ttl, httponly=True,
                        secure=settings.cookie_secure, samesite="lax", path="/auth/google")


def clear_google_cookie(response, settings, name):
    response.delete_cookie(name, path="/auth/google", httponly=True,
                           secure=settings.cookie_secure, samesite="lax")
