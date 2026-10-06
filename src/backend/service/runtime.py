import hashlib
from contextlib import ExitStack

from backend.domain.csrf import CSRFService
from backend.domain.email_codes import EmailCodeService
from backend.domain.passwords import PasswordHasher
from backend.domain.tokens import JWTService
from backend.infra.config.settings import Settings
from backend.infra.connections.database import DatabaseConnection
from backend.infra.connections.email import GmailConnection
from backend.infra.connections.google import GoogleConnection
from backend.infra.connections.photos import PhotoStorage
from backend.infra.connections.redis import RedisConnection
from backend.repository.cache.aside import CacheAside
from backend.repository.cache.manager import CachedRepositoryManager
from backend.repository.db.control.manager import RepositoryManager
from backend.repository.db.schema import create_tables
from backend.repository.redis.email_codes import EmailCodeRepository
from backend.repository.redis.oauth import OAuthRepository
from backend.repository.redis.rate_limits import RateLimitRepository
from backend.service.approvals import ApprovalService
from backend.service.auth import AuthService
from backend.service.clients import ClientService
from backend.service.email_messages import AccountMessages
from backend.service.google import GoogleAuthService
from backend.service.members import MemberService
from backend.service.passwords import PasswordService
from backend.service.profiles import ProfileService
from backend.service.rate_limits import RateLimitService
from backend.service.registration import RegistrationService
from backend.service.security import SessionSecurity


class RuntimeServices:
    def __init__(self, settings: Settings):
        self._cleanup = ExitStack()
        try:
            self.database = DatabaseConnection(settings)
            self._cleanup.callback(self.database.close)
            self.redis = RedisConnection(settings)
            self._cleanup.callback(self.redis.close)
            database_namespace = hashlib.sha256(settings.database_url.encode()).hexdigest()[:16]
            self.cache = CacheAside(self.redis.client, ttl=settings.cache_ttl_seconds,
                                    prefix="nexo:cache:" + database_namespace)
            self.repositories = RepositoryManager(self.database, cache=self.cache, principal_email=settings.email)
            self.cached_repositories = CachedRepositoryManager(self.repositories, self.cache)
            self.clients = ClientService(self.repositories, self.cached_repositories)
            self.profiles = ProfileService(self.repositories, PhotoStorage(settings.upload_dir), settings)
            self.members = MemberService(self.repositories, self.cached_repositories, self.profiles)
            self.approvals = ApprovalService(self.repositories, self.cached_repositories)
            rate_namespace = "nexo:rate:" + hashlib.sha256(
                (settings.database_url + settings.jwt_secret_key.get_secret_value()).encode()).hexdigest()[:32]
            self.rate_limits = RateLimitService(RateLimitRepository(self.redis.client), settings, rate_namespace)
            self.passwords = PasswordHasher()
            self.tokens = JWTService(settings.jwt_secret_key.get_secret_value(),
                                     expire_minutes=settings.jwt_expire_minutes)
            self.sessions = SessionSecurity(self.tokens, self.repositories)
            self.csrf = CSRFService(settings.jwt_secret_key.get_secret_value())
            self.email = GmailConnection(settings)
            self._cleanup.callback(self.email.close)
            self.messages = AccountMessages(self.email)
            self.auth = AuthService(self.repositories, self.passwords, self.sessions, self.messages)
            namespace = "nexo:oauth:" + hashlib.sha256(
                settings.jwt_secret_key.get_secret_value().encode()).hexdigest()[:32]
            self.google = GoogleAuthService(
                settings, GoogleConnection(settings), OAuthRepository(self.redis.client, namespace),
                self.repositories, self.sessions, self.csrf, self.messages)
            self.registration = RegistrationService(
                self.auth, EmailCodeService(settings.jwt_secret_key.get_secret_value(), "registration"),
                EmailCodeRepository(self.redis.client, namespace + ":registration:" + database_namespace,
                                    ttl=settings.email_code_ttl_seconds,
                                    max_attempts=settings.email_code_max_attempts,
                                    cooldown=settings.email_code_resend_cooldown_seconds), self.email,
                delivery_timeout=min(settings.email_timeout_seconds + 2, 12))
            self.password_service = PasswordService(
                self.repositories, self.passwords,
                EmailCodeService(settings.jwt_secret_key.get_secret_value()),
                EmailCodeRepository(self.redis.client, namespace + ":password:" + database_namespace,
                                    ttl=settings.email_code_ttl_seconds,
                                    max_attempts=settings.email_code_max_attempts,
                                    cooldown=settings.email_code_resend_cooldown_seconds), self.email)
        except BaseException:
            self._cleanup.close()
            raise

    def initialize(self, settings: Settings) -> None:
        create_tables(self.database.engine)
        self.auth.bootstrap_admin(settings)
        self.approvals.synchronize_pending()

    def readiness(self) -> dict[str, bool]:
        status = {}
        for name, connection in [("database", self.database), ("redis", self.redis)]:
            try:
                status[name] = connection.ping()
            except Exception:
                status[name] = False
        return status

    def close(self) -> None:
        self._cleanup.close()
