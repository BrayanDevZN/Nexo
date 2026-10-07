import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.controller.handles.account_deletion import router as account_deletion_router
from backend.controller.handles.api_keys import router as api_keys_router
from backend.controller.handles.approvals import (
    announcements_router,
    member_notifications_router,
    notifications_router,
    users_router,
)
from backend.controller.handles.auth import router as auth_router
from backend.controller.handles.chat import router as chat_router
from backend.controller.handles.clients import router as clients_router
from backend.controller.handles.dashboard import router as dashboard_router
from backend.controller.handles.documents import router as documents_router
from backend.controller.handles.google import router as google_router
from backend.controller.handles.health import router as health_router
from backend.controller.handles.members import directory_router
from backend.controller.handles.members import router as members_router
from backend.controller.handles.passwords import router as passwords_router
from backend.controller.handles.profiles import router as profiles_router
from backend.controller.handles.push import router as push_router
from backend.controller.handles.realtime import router as realtime_router
from backend.controller.middleware.csrf import CSRFMiddleware
from backend.controller.middleware.rate_limits import RateLimitMiddleware
from backend.infra.config.settings import Settings, get_settings
from backend.service.runtime import RuntimeServices


def create_app(settings: Settings | None = None) -> FastAPI:
    config = settings if settings is not None else get_settings()
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        services = RuntimeServices(config)
        app.state.services = services
        try:
            await asyncio.to_thread(services.initialize, config)
            yield
        finally:
            await services.realtime_connection.close()
            await asyncio.to_thread(services.close)

    app = FastAPI(
        lifespan=lifespan,
        title="Nexo Admin API", version="0.1.0",
        docs_url=None if config.environment == "production" else "/docs",
        redoc_url=None if config.environment == "production" else "/redoc",
        openapi_url=None if config.environment == "production" else "/openapi.json",
    )
    app.state.settings = config
    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        # Do not echo submitted passwords or unknown sensitive fields.
        errors = [{"loc": error["loc"], "type": error["type"], "msg": error["msg"]}
                  for error in exc.errors()]
        return JSONResponse(status_code=422, content={"detail": errors})

    app.add_middleware(CSRFMiddleware, settings=config)
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(
        CORSMiddleware, allow_origins=config.cors_origins, allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-CSRF-Token"], expose_headers=["Retry-After"],
    )
    routers = [chat_router, realtime_router, health_router, auth_router, api_keys_router, account_deletion_router, documents_router, passwords_router, clients_router, dashboard_router, profiles_router, push_router,
               google_router, users_router, members_router, directory_router, notifications_router, announcements_router, member_notifications_router]
    # Public routes from our handles provide stable templates across FastAPI versions.
    app.state.rate_limit_routes = [route for router in routers for route in router.routes]
    for router in routers:
        app.include_router(router)
    return app
