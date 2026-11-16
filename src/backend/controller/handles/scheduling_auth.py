"""Accounts of /atendimentos: register with an e-mail code, password or Google sign-in, profile and password."""
import asyncio

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile
from fastapi.responses import RedirectResponse
from redis.exceptions import RedisError

from backend.controller.cookies import clear_google_cookie, set_google_cookie
from backend.controller.dependencies import booking_user
from backend.controller.schema.auth import LoginInput, RegistrationConfirmInput
from backend.controller.schema.passwords import (
    PasswordChangeInput,
    RecoveryConfirmInput,
    RecoveryRequestInput,
)
from backend.controller.schema.scheduling import (
    BookingProfileInput,
    BookingRegistrationInput,
    BookingUserOutput,
)
from backend.domain.photos import PhotoTooLarge, PhotoValidationError
from backend.infra.connections.email import EmailUnavailableError
from backend.repository.redis.oauth import OAuthStateError
from backend.service.access import AccessDenied, ResourceNotFound
from backend.service.auth import RegistrationConflict
from backend.service.passwords import PasswordRecoveryError
from backend.service.registration import RegistrationCodeError, RegistrationCooldownError
from backend.service.security import AuthenticationError

router = APIRouter(prefix="/atendimentos/auth", tags=["scheduling authentication"])
FLOW_COOKIE = "nexo_google_flow"
PROFILE_COOKIE = "nexo_atendimentos_google_profile"


def set_booking_cookie(response, settings, token):
    response.set_cookie(settings.booking_cookie_name, token, httponly=True, secure=settings.cookie_secure,
                        samesite=settings.cookie_samesite, path="/", max_age=settings.jwt_expire_minutes * 60)


def clear_booking_cookie(request, status_code=204):
    settings = request.app.state.settings
    response = Response(status_code=status_code)
    response.delete_cookie(settings.booking_cookie_name, path="/", httponly=True,
                           secure=settings.cookie_secure, samesite=settings.cookie_samesite)
    return response


@router.post("/register", status_code=202)
def register(data: BookingRegistrationInput, request: Request):
    try:
        request.app.state.services.booking_registration.request(
            name=data.name, email=str(data.email), phone=data.phone, password=data.password.get_secret_value())
        return {"detail": "Confirmation code sent"}
    except RegistrationConflict:
        raise HTTPException(status_code=409, detail="Email already registered") from None
    except RegistrationCooldownError:
        cooldown = request.app.state.settings.email_code_resend_cooldown_seconds
        raise HTTPException(status_code=429, detail="Wait before requesting another code",
                            headers={"Retry-After": str(cooldown)}) from None
    except (RedisError, EmailUnavailableError):
        raise HTTPException(status_code=503, detail="Registration email unavailable") from None


@router.post("/register/confirm", response_model=BookingUserOutput, status_code=201)
def confirm_registration(data: RegistrationConfirmInput, request: Request, response: Response):
    services = request.app.state.services
    try:
        user = services.booking_registration.confirm(str(data.email), data.code.get_secret_value())
    except RegistrationCodeError:
        raise HTTPException(status_code=400, detail="Invalid or expired registration code") from None
    except RegistrationConflict:
        raise HTTPException(status_code=409, detail="Email already registered") from None
    except RedisError:
        raise HTTPException(status_code=503, detail="Registration unavailable") from None
    set_booking_cookie(response, request.app.state.settings, services.booking_sessions.issue(user))
    return user


@router.post("/login", response_model=BookingUserOutput)
def login(data: LoginInput, request: Request, response: Response):
    try:
        user, token = request.app.state.services.booking_auth.login(str(data.email), data.password.get_secret_value())
    except AuthenticationError:
        raise HTTPException(status_code=401, detail="Invalid email or password") from None
    set_booking_cookie(response, request.app.state.settings, token)
    return user


@router.get("/me", response_model=BookingUserOutput)
def me(user=Depends(booking_user)):
    return user


@router.get("/csrf")
def csrf(request: Request, user=Depends(booking_user)):
    services = request.app.state.services
    claims = services.booking_tokens.read(request.cookies[request.app.state.settings.booking_cookie_name])
    return {"csrf_token": services.csrf.create(claims.token_id)}


@router.post("/logout", status_code=204)
def logout(request: Request, user=Depends(booking_user)):
    request.app.state.services.booking_sessions.revoke_all(user.id)
    return clear_booking_cookie(request)


@router.put("/profile", response_model=BookingUserOutput)
def update_profile(data: BookingProfileInput, request: Request, actor=Depends(booking_user)):
    try:
        return request.app.state.services.booking_auth.update_profile(actor, data.name, data.phone)
    except AccessDenied as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from None


def photo_error(exc):
    if isinstance(exc, PhotoTooLarge):
        return HTTPException(status_code=413, detail=str(exc))
    if isinstance(exc, PhotoValidationError):
        return HTTPException(status_code=400, detail=str(exc))
    if isinstance(exc, AccessDenied):
        return HTTPException(status_code=403, detail=str(exc))
    return HTTPException(status_code=404, detail=str(exc))


@router.put("/profile/photo", response_model=BookingUserOutput)
async def upload_photo(request: Request, file: UploadFile = File(), actor=Depends(booking_user)):
    settings = request.app.state.settings
    try:
        data = await file.read(settings.profile_photo_max_bytes + 1)
        return await asyncio.to_thread(request.app.state.services.booking_auth.upload_photo, actor, data, settings)
    except (AccessDenied, PhotoValidationError) as exc:
        raise photo_error(exc) from None
    finally:
        await file.close()


@router.get("/profile/photo", responses={200: {"content": {"image/jpeg": {}}}})
def read_photo(request: Request, user_id: str | None = Query(default=None, max_length=36), actor=Depends(booking_user)):
    try:
        data = request.app.state.services.booking_auth.read_photo(actor, user_id)
    except (AccessDenied, ResourceNotFound) as exc:
        raise photo_error(exc) from None
    return Response(content=data, media_type="image/jpeg", headers={"X-Content-Type-Options": "nosniff"})


@router.delete("/profile/photo", status_code=204)
def delete_photo(request: Request, actor=Depends(booking_user)):
    try:
        request.app.state.services.booking_auth.delete_photo(actor)
    except AccessDenied as exc:
        raise photo_error(exc) from None
    return Response(status_code=204)


@router.post("/password/change", status_code=204)
def change_password(data: PasswordChangeInput, request: Request, actor=Depends(booking_user)):
    try:
        request.app.state.services.booking_passwords.change(
            actor, data.current_password.get_secret_value(), data.new_password.get_secret_value())
    except PasswordRecoveryError:
        raise HTTPException(status_code=400, detail="Current password is incorrect") from None
    except AuthenticationError:
        raise HTTPException(status_code=401, detail="Invalid or expired session") from None
    return clear_booking_cookie(request)


@router.post("/password/recovery/request", status_code=202)
def request_recovery(data: RecoveryRequestInput, request: Request):
    try:
        request.app.state.services.booking_passwords.request_code(str(data.email))
    except (RedisError, EmailUnavailableError):
        raise HTTPException(status_code=503, detail="Password recovery unavailable") from None
    return {"detail": "If the account is eligible, a recovery code will be sent"}


@router.post("/password/recovery/confirm", status_code=204)
def confirm_recovery(data: RecoveryConfirmInput, request: Request):
    try:
        request.app.state.services.booking_passwords.confirm(
            str(data.email), data.code.get_secret_value(), data.new_password.get_secret_value())
    except PasswordRecoveryError:
        raise HTTPException(status_code=400, detail="Invalid or expired recovery code") from None
    except RedisError:
        raise HTTPException(status_code=503, detail="Password recovery unavailable") from None
    return clear_booking_cookie(request)


@router.get("/google/login")
def google_login(request: Request):
    try:
        url, browser = request.app.state.services.booking_google.start()
    except (ValueError, RedisError):
        raise HTTPException(status_code=503, detail="Google authentication unavailable") from None
    response = RedirectResponse(url, status_code=302)
    set_google_cookie(response, request.app.state.settings, FLOW_COOKIE, browser, 300)
    return response


@router.get("/google/profile")
def google_profile(request: Request):
    try:
        return request.app.state.services.booking_google.profile(request.cookies.get(PROFILE_COOKIE, ""))
    except RedisError:
        raise HTTPException(status_code=503, detail="Google authentication unavailable") from None
    except OAuthStateError:
        raise HTTPException(status_code=401, detail="Invalid or expired Google authentication") from None


@router.post("/google/complete", response_model=BookingUserOutput, status_code=201)
def google_complete(data: BookingProfileInput, request: Request, response: Response):
    settings = request.app.state.settings
    try:
        user, token = request.app.state.services.booking_google.complete(
            request.cookies.get(PROFILE_COOKIE, ""), request.headers.get("x-csrf-token", ""), data.name, data.phone)
    except RedisError:
        raise HTTPException(status_code=503, detail="Google authentication unavailable") from None
    except RegistrationConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    except OAuthStateError:
        raise HTTPException(status_code=401, detail="Invalid or expired Google authentication") from None
    clear_google_cookie(response, settings, PROFILE_COOKIE)
    set_booking_cookie(response, settings, token)
    return user
