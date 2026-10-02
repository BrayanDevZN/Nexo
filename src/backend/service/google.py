import asyncio
import hashlib
import secrets
from dataclasses import asdict

from sqlalchemy.exc import IntegrityError

from backend.domain.google import GoogleIdentity, GoogleIdentityError, GoogleTokenVerifier
from backend.infra.connections.google import GoogleProviderError
from backend.repository.redis.oauth import OAuthStateError
from backend.service.auth import RegistrationConflict


class GoogleUnavailable(ValueError):
    pass


class GoogleAuthService:
    def __init__(self, settings, provider, flows, repositories, sessions, csrf):
        self.settings, self.provider, self.flows = settings, provider, flows
        self.repositories, self.sessions, self.csrf = repositories, sessions, csrf

    def start(self):
        if not self.settings.google_client_id:
            raise GoogleUnavailable("Google login is not configured")
        browser, nonce, verifier = (secrets.token_urlsafe(32) for _ in range(3))
        state = self.flows.save("state", {"browser": hashlib.sha256(browser.encode()).hexdigest(),
                                        "nonce": nonce, "verifier": verifier}, 300)
        return self.provider.authorization_url(state, nonce, verifier), browser

    async def callback(self, state, browser, code):
        record = await asyncio.to_thread(self.flows.consume_state, state, browser)
        if not code or len(code) > 4096:
            raise OAuthStateError("Invalid Google authorization code")
        packet = await self.provider.exchange(code, record["verifier"], record["nonce"])
        try:
            identity = GoogleTokenVerifier(self.settings.google_client_id).verify(
                packet["id_token"], packet["keys"], record["nonce"])
        except GoogleIdentityError:
            raise GoogleProviderError("Google authentication failed") from None
        return await asyncio.to_thread(self._resolve_identity, identity)

    def _resolve_identity(self, identity):
        with self.repositories.transaction() as repos:
            user = repos.users.by_google_sub(identity.subject)
            if user:
                return "session", self.sessions.issue(user)
            if repos.users.by_email(identity.email):
                # Linking needs explicit proof of the existing local account.
                raise RegistrationConflict("Email already belongs to another account")
        return "profile", self.flows.save("profile", asdict(identity), 600)

    def profile(self, grant):
        identity = self.flows.read("profile", grant)
        return {"name": identity["name"], "email": identity["email"],
                "csrf_token": self.csrf.create("google-profile:" + grant)}

    def complete(self, grant, csrf_token, name, phone):
        if not self.csrf.verify("google-profile:" + grant, csrf_token):
            raise OAuthStateError("Invalid profile CSRF token")
        identity = GoogleIdentity(**self.flows.consume("profile", grant))
        try:
            with self.repositories.transaction() as repos:
                if (repos.users.by_email(identity.email)
                        or repos.users.by_google_sub(identity.subject)):
                    raise RegistrationConflict("Account already registered; sign in again")
                user = repos.users.create(name=name, phone=phone, email=identity.email,
                                          google_sub=identity.subject)
            return user, self.sessions.issue(user)
        except IntegrityError:
            raise RegistrationConflict("Account already registered; sign in again") from None
