import hashlib

from backend.repository.redis.rate_limits import RateBudget

SENSITIVE_ROUTES = {
    "/auth/login", "/auth/register", "/auth/register/confirm", "/auth/logout", "/auth/password/change",
    "/auth/password/recovery/request", "/auth/password/recovery/confirm",
}


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
                       config.rate_limit, config.rate_limit_window_seconds),
        ]
        if route in SENSITIVE_ROUTES or route.startswith("/auth/google/"):
            budgets.append(RateBudget(
                f"{self.namespace}:auth:{identity}:{config.auth_rate_limit_window_seconds}",
                config.auth_rate_limit, config.auth_rate_limit_window_seconds))
        return budgets

    def check(self, peer, method, route):
        return self.repository.check(self.budgets(peer, method, route))
