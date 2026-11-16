"""Accounts of the scheduling product (/atendimentos): personal, without approval, in their own table."""
import hashlib
import secrets
from dataclasses import asdict

from sqlalchemy.exc import IntegrityError

from backend.domain.google import GoogleIdentity
from backend.domain.photos import normalize_photo
from backend.repository.redis.oauth import OAuthStateError
from backend.service.access import AccessDenied, ResourceNotFound
from backend.service.auth import RegistrationConflict
from backend.service.security import AuthenticationError

BOOKING_APP = "atendimentos"


def authorize_booking(repos, actor):
    """Authoritative SQL check of a scheduling session; cached rows never authorize anything."""
    current = repos.booking_users.get(actor.id)
    if current is None or current.session_version != actor.session_version:
        raise AccessDenied("Access denied")
    return current


class BookingAuthService:
    repository_name = "booking_users"

    def __init__(self, repositories, passwords, sessions):
        self.repositories, self.passwords, self.sessions = repositories, passwords, sessions
        # Verify an equivalent hash even when the email does not exist, so timing does not reveal accounts.
        self._dummy_hash = passwords.hash("unused-login-placeholder-password")

    def register(self, *, name, email, phone, password=None, password_hash=None):
        hashed = password_hash or self.passwords.hash(password)
        try:
            with self.repositories.transaction() as repos:
                if repos.booking_users.by_email(email):
                    raise RegistrationConflict("Email already registered")
                return repos.booking_users.create(name=name, email=email, phone=phone, password_hash=hashed)
        except IntegrityError:
            raise RegistrationConflict("Email already registered") from None

    def login(self, email, password):
        with self.repositories.read_transaction() as repos:
            user = repos.booking_users.by_email(email)
        hashed = user.password_hash if user and user.password_hash else self._dummy_hash
        valid = self.passwords.verify(password, hashed)
        if not valid or user is None or not user.password_hash:
            raise AuthenticationError("Invalid email or password")
        return user, self.sessions.issue(user)

    def for_panel_user(self, panel_user):
        """The scheduling account of a panel API key's owner: the one registered with the same (verified) e-mail."""
        with self.repositories.read_transaction() as repos:
            user = repos.booking_users.by_email(panel_user.email)
            if user is None:
                raise AccessDenied("No Atendimentos account with this e-mail")
            return user

    def update_profile(self, actor, name, phone):
        with self.repositories.transaction() as repos:
            user = authorize_booking(repos, actor)
            if not repos.booking_users.set_profile_fields(user, name=name, phone=phone):
                raise AccessDenied("Access denied")
            return user

    def upload_photo(self, actor, data, settings):
        normalized = normalize_photo(data, max_bytes=settings.profile_photo_max_bytes,
                                     max_pixels=settings.profile_photo_max_pixels)
        with self.repositories.transaction() as repos:
            user = authorize_booking(repos, actor)
            repos.booking_users.set_photo(user, normalized)
            return user

    def delete_photo(self, actor):
        with self.repositories.transaction() as repos:
            repos.booking_users.set_photo(authorize_booking(repos, actor), None)

    def read_photo(self, actor, user_id=None):
        """Own photo, or a teammate's: both must share at least one business."""
        with self.repositories.read_transaction() as repos:
            user = authorize_booking(repos, actor)
            if user_id and user_id != user.id:
                mine = {business.id for business, _ in repos.businesses.list_for_user(user.id)}
                theirs = {business.id for business, _ in repos.businesses.list_for_user(user_id)}
                if not mine & theirs:
                    raise ResourceNotFound("Photo not found")
                user = repos.booking_users.get(user_id)
            if user is None or user.profile_photo_data is None:
                raise ResourceNotFound("Photo not found")
            return user.profile_photo_data


class BookingGoogleAuth:
    """Google sign-in of the scheduling product. It shares the flow store and the callback with the panel."""

    def __init__(self, settings, provider, flows, repositories, sessions, csrf):
        self.settings, self.provider, self.flows = settings, provider, flows
        self.repositories, self.sessions, self.csrf = repositories, sessions, csrf

    def start(self):
        if not self.settings.google_client_id:
            raise ValueError("Google login is not configured")
        browser, nonce, verifier = (secrets.token_urlsafe(32) for _ in range(3))
        # "app" is read back from Redis at the callback, never from the URL, so it cannot be forged.
        state = self.flows.save("state", {"browser": hashlib.sha256(browser.encode()).hexdigest(),
                                        "nonce": nonce, "verifier": verifier, "app": BOOKING_APP}, 300)
        return self.provider.authorization_url(state, nonce, verifier), browser

    def resolve(self, identity):
        """A known account gets a session; a new identity gets a short grant to finish the profile."""
        try:
            with self.repositories.transaction() as repos:
                user = repos.booking_users.by_google_sub(identity.subject)
                if user:
                    return "session", self.sessions.issue(user)
                user = repos.booking_users.by_email(identity.email)
                if user:
                    if not user.password_hash or user.google_sub is not None:
                        raise RegistrationConflict("Google identity belongs to another account")
                    token = self.sessions.issue(user)
                    if not repos.booking_users.link_google_if_local(user, identity.subject):
                        raise RegistrationConflict("Account changed; sign in again")
                    return "session", token
        except IntegrityError:
            raise RegistrationConflict("Google identity already registered; sign in again") from None
        return "profile", self.flows.save("booking-profile", asdict(identity), 600)

    def profile(self, grant):
        identity = self.flows.read("booking-profile", grant)
        return {"name": identity["name"], "email": identity["email"],
                "csrf_token": self.csrf.create("booking-google-profile:" + grant)}

    def complete(self, grant, csrf_token, name, phone):
        if not self.csrf.verify("booking-google-profile:" + grant, csrf_token):
            raise OAuthStateError("Invalid profile CSRF token")
        identity = GoogleIdentity(**self.flows.consume("booking-profile", grant))
        try:
            with self.repositories.transaction() as repos:
                if repos.booking_users.by_email(identity.email) or repos.booking_users.by_google_sub(identity.subject):
                    raise RegistrationConflict("Account already registered; sign in again")
                user = repos.booking_users.create(name=name, phone=phone, email=identity.email,
                                                  google_sub=identity.subject)
            return user, self.sessions.issue(user)
        except IntegrityError:
            raise RegistrationConflict("Account already registered; sign in again") from None
