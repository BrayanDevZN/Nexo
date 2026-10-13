import asyncio
import hashlib
import logging
import secrets
from dataclasses import asdict

from sqlalchemy.exc import IntegrityError

from backend.domain.google import GoogleIdentity, GoogleIdentityError, GoogleTokenVerifier
from backend.infra.connections.google import GoogleProviderError
from backend.repository.redis.oauth import OAuthStateError
from backend.service.approvals import ApprovalService
from backend.service.auth import RegistrationConflict

logger = logging.getLogger(__name__)


class GoogleUnavailable(ValueError):
    pass


class GoogleAuthService:
    def __init__(self, settings, provider, flows, repositories, sessions, csrf, messages=None,
                 invitations=None, invitation_repository=None):
        self.settings, self.provider, self.flows = settings, provider, flows
        self.repositories, self.sessions, self.csrf = repositories, sessions, csrf
        self.messages = messages
        self.invitations, self.invitation_repository = invitations, invitation_repository

    def start(self, invite_token=None):
        if not self.settings.google_client_id:
            raise GoogleUnavailable("Google login is not configured")
        if invite_token:
            if self.invitation_repository is None:
                raise GoogleUnavailable("Invitations are unavailable")
            self.invitation_repository.read(invite_token)
        browser, nonce, verifier = (secrets.token_urlsafe(32) for _ in range(3))
        state = self.flows.save("state", {"browser": hashlib.sha256(browser.encode()).hexdigest(),
                                        "nonce": nonce, "verifier": verifier,
                                        "invite_token": invite_token}, 300)
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
            logger.warning("Google identity verification failed")
            raise GoogleProviderError("Google authentication failed") from None
        kind, grant = await asyncio.to_thread(self._resolve_identity, identity, record.get("invite_token"))
        invite_token = None
        if kind == "profile" and record.get("invite_token"):
            invite_token = record["invite_token"]
        return kind, grant, invite_token

    def _resolve_identity(self, identity, invite_token=None):
        try:
            with self.repositories.transaction() as repos:
                user = repos.users.by_google_sub(identity.subject)
                if user:
                    if invite_token:
                        raise RegistrationConflict("This invitation is for a new account")
                    return "session", self.sessions.issue(user)
                user = repos.users.by_email(identity.email)
                if user:
                    if invite_token:
                        raise RegistrationConflict("This invitation is for a new account")
                    if not user.password_hash or user.google_sub is not None:
                        raise RegistrationConflict("Google identity belongs to another account")
                    # Identity comes only from the verified ID token, never a browser email.
                    token = self.sessions.issue(user)
                    if not repos.users.link_google_if_local(user, identity.subject):
                        raise RegistrationConflict("Account changed; sign in again")
                    return "session", token
        except IntegrityError:
            raise RegistrationConflict("Google identity already registered; sign in again") from None
        profile = asdict(identity)
        if invite_token:
            profile["invite_token"] = invite_token
        return "profile", self.flows.save("profile", profile, 600)

    def profile(self, grant):
        identity = self.flows.read("profile", grant)
        return {"name": identity["name"], "email": identity["email"],
                "invite_token": identity.get("invite_token"),
                "csrf_token": self.csrf.create("google-profile:" + grant)}

    def complete(self, grant, csrf_token, name, phone, invite_token=None):
        if not self.csrf.verify("google-profile:" + grant, csrf_token):
            raise OAuthStateError("Invalid profile CSRF token")
        profile = self.flows.consume("profile", grant)
        flow_invite_token = profile.pop("invite_token", None)
        if flow_invite_token and invite_token and flow_invite_token != invite_token:
            raise OAuthStateError("Invitation does not match Google sign-in flow")
        invite_token = flow_invite_token or invite_token
        identity = GoogleIdentity(**profile)
        if invite_token:
            if self.invitations is None:
                raise RegistrationConflict("Invitation is unavailable")
            user, token = self.invitations.register_google(
                invite_token, name=name, email=identity.email, phone=phone,
                google_sub=identity.subject)
            if self.messages:
                self.messages.welcome(user)
            return user, token
        try:
            with self.repositories.transaction() as repos:
                if (repos.users.by_email(identity.email)
                        or repos.users.by_google_sub(identity.subject)):
                    raise RegistrationConflict("Account already registered; sign in again")
                user = repos.users.create(name=name, phone=phone, email=identity.email,
                                          google_sub=identity.subject)
                ApprovalService.notify_registration(repos, user)
            if self.messages:
                self.messages.welcome(user)
            return user, self.sessions.issue(user)
        except IntegrityError:
            raise RegistrationConflict("Account already registered; sign in again") from None
