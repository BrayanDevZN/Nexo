import asyncio
import contextlib
import logging
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
from backend.controller.handles.automation_requests import router as automation_requests_router
from backend.controller.handles.automations import router as automations_router
from backend.controller.handles.chat import router as chat_router
from backend.controller.handles.clients import router as clients_router
from backend.controller.handles.paid_leads import router as paid_leads_router
from backend.controller.handles.public_paid_leads import router as public_paid_leads_router
from backend.controller.handles.dashboard import router as dashboard_router
from backend.controller.handles.databases import router as databases_router
from backend.controller.handles.documents import router as documents_router
from backend.controller.handles.google import router as google_router
from backend.controller.handles.health import router as health_router
from backend.controller.handles.maps import router as maps_router
from backend.controller.handles.members import directory_router, invitations_router
from backend.controller.handles.members import router as members_router
from backend.controller.handles.passwords import router as passwords_router
from backend.controller.handles.profiles import router as profiles_router
from backend.controller.handles.push import router as push_router
from backend.controller.handles.realtime import router as realtime_router
from backend.controller.handles.videos import router as videos_router
from backend.controller.handles.webhook_events import router as webhook_events_router
from backend.controller.middleware.csrf import CSRFMiddleware
from backend.controller.middleware.rate_limits import RateLimitMiddleware
from backend.infra.config.settings import Settings, get_settings
from backend.service.runtime import RuntimeServices

logger = logging.getLogger(__name__)
MAPS_POLL_SECONDS = 20


async def _announce_finished_searches(services) -> None:
    """Poll the maps server so creators are told when a search ends, even with the panel closed."""
    while True:
        await asyncio.sleep(MAPS_POLL_SECONDS)
        try:
            await asyncio.to_thread(services.maps.finish_pending)
        except Exception:
            logger.warning("Maps search check failed", exc_info=True)


def create_app(settings: Settings | None = None) -> FastAPI:
    config = settings if settings is not None else get_settings()
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        services = RuntimeServices(config)
        app.state.services = services
        try:
            await asyncio.to_thread(services.initialize, config)
            poller = asyncio.create_task(_announce_finished_searches(services))
            try:
                yield
            finally:
                poller.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await poller
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
    routers = [chat_router, realtime_router, health_router, auth_router, api_keys_router, account_deletion_router,
               automation_requests_router, automations_router, documents_router, passwords_router, clients_router, paid_leads_router, public_paid_leads_router,
               dashboard_router, databases_router, maps_router, videos_router, profiles_router, push_router, webhook_events_router, google_router, users_router,
               members_router, invitations_router, directory_router, notifications_router, announcements_router,
               member_notifications_router]
    app.state.rate_limit_routes = [route for router in routers for route in router.routes]
    for router in routers:
        app.include_router(router)
    return app
