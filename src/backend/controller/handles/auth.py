from fastapi import APIRouter, Depends, HTTPException, Request, Response
from redis.exceptions import RedisError

from backend.controller.cookies import set_session_cookie
from backend.controller.dependencies import current_user
from backend.controller.schema.auth import (
    LoginInput,
    RegistrationConfirmInput,
    RegistrationInput,
    UserOutput,
)
from backend.infra.connections.email import EmailUnavailableError
from backend.service.auth import RegistrationConflict
from backend.service.registration import RegistrationCodeError
from backend.service.security import AuthenticationError

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post("/register", status_code=202)
def register(data: RegistrationInput, request: Request):
    try:
        request.app.state.services.registration.request(
            name=data.name, email=str(data.email), phone=data.phone,
            password=data.password.get_secret_value())
        return {"detail": "Confirmation code sent"}
    except RegistrationConflict:
        raise HTTPException(status_code=409, detail="Email already registered") from None
    except (RedisError, EmailUnavailableError):
        raise HTTPException(status_code=503, detail="Registration email unavailable") from None


@router.post("/register/confirm", response_model=UserOutput, status_code=201)
def confirm_registration(data: RegistrationConfirmInput, request: Request, response: Response):
    try:
        services = request.app.state.services
        user = services.registration.confirm(str(data.email), data.code.get_secret_value())
        set_session_cookie(response, request.app.state.settings, services.sessions.issue(user))
        return user
    except RegistrationCodeError:
        raise HTTPException(status_code=400, detail="Invalid or expired registration code") from None
    except RegistrationConflict:
        raise HTTPException(status_code=409, detail="Email already registered") from None
    except RedisError:
        raise HTTPException(status_code=503, detail="Registration unavailable") from None


@router.post("/login", response_model=UserOutput)
def login(data: LoginInput, request: Request, response: Response):
    try:
        user, token = request.app.state.services.auth.login(
            str(data.email), data.password.get_secret_value())
    except AuthenticationError:
        raise HTTPException(status_code=401, detail="Invalid email or password") from None
    settings = request.app.state.settings
    set_session_cookie(response, settings, token)
    return user


@router.get("/me", response_model=UserOutput)
def me(user=Depends(current_user)):
    return user


@router.get("/csrf")
def csrf(request: Request, user=Depends(current_user)):
    services = request.app.state.services
    claims = services.tokens.read(request.cookies[request.app.state.settings.auth_cookie_name])
    return {"csrf_token": services.csrf.create(claims.token_id)}


@router.post("/logout", status_code=204)
def logout(request: Request, user=Depends(current_user)):
    request.app.state.services.sessions.revoke_all(user.id)
    settings = request.app.state.settings
    response = Response(status_code=204)
    response.delete_cookie(settings.auth_cookie_name, path="/", httponly=True,
                           secure=settings.cookie_secure, samesite=settings.cookie_samesite)
    return response
