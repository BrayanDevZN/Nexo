def set_session_cookie(response, settings, token):
    response.set_cookie(settings.auth_cookie_name, token, httponly=True,
                        secure=settings.cookie_secure, samesite=settings.cookie_samesite,
                        path="/", max_age=settings.jwt_expire_minutes * 60)


def set_google_cookie(response, settings, name, value, ttl):
    # The flow returns by navigation; profile completion uses frontend fetches.
    samesite = "lax" if name == "nexo_google_flow" else settings.cookie_samesite
    response.set_cookie(name, value, max_age=ttl, httponly=True,
                        secure=settings.cookie_secure, samesite=samesite, path="/auth/google")


def clear_google_cookie(response, settings, name):
    samesite = "lax" if name == "nexo_google_flow" else settings.cookie_samesite
    response.delete_cookie(name, path="/auth/google", httponly=True,
                           secure=settings.cookie_secure, samesite=samesite)
