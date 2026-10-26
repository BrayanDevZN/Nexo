import hashlib

from backend.repository.redis.rate_limits import RateBudget

SENSITIVE_ROUTES = {
    "/auth/login", "/auth/register", "/auth/register/confirm", "/auth/logout", "/auth/password/change",
    "/auth/password/recovery/request", "/auth/password/recovery/confirm", "/auth/account/deletion/request", "/auth/account/deletion/confirm",
    "/auth/invitations/{token}/register",
}


# Public endpoints take anonymous writes, so each address gets a small extra budget per route (requests per window).
PUBLIC_ROUTE_LIMITS = {"/public/paid-leads/visit": 20, "/public/paid-leads/{lead_id}/whatsapp": 20}
# Adding leads from the Maps sends many small requests and polls the progress, so these routes get a larger budget.
BULK_ROUTES = {"/maps/funnel": 10, "/maps/funnel/batches": 10, "/maps/funnel/batches/{batch_id}": 10}


class RateLimitService:
    def __init__(self, repository, settings, namespace):
        self.repository, self.settings, self.namespace = repository, settings, namespace

    def budgets(self, peer: str, method: str, route: str):
        config = self.settings
        identity = hashlib.sha256(peer.encode()).hexdigest()
        operation = hashlib.sha256((method + ":" + route).encode()).hexdigest()
        budgets = [
            RateBudget(f"{self.namespace}:global:{config.global_rate_limit_window_seconds}",
                       config.global_rate_limit, config.global_rate_limit_window_seconds),
            RateBudget(f"{self.namespace}:route:{identity}:{operation}:{config.rate_limit_window_seconds}",
                       config.rate_limit * BULK_ROUTES.get(route, 1), config.rate_limit_window_seconds),
        ]
        if route in SENSITIVE_ROUTES or route.startswith("/auth/google/"):
            budgets.append(RateBudget(
                f"{self.namespace}:auth:{identity}:{config.auth_rate_limit_window_seconds}",
                config.auth_rate_limit, config.auth_rate_limit_window_seconds))
        if route in PUBLIC_ROUTE_LIMITS:
            budgets.append(RateBudget(
                f"{self.namespace}:public:{identity}:{operation}:{config.auth_rate_limit_window_seconds}",
                PUBLIC_ROUTE_LIMITS[route], config.auth_rate_limit_window_seconds))
        return budgets

    def check(self, peer, method, route):
        return self.repository.check(self.budgets(peer, method, route))
