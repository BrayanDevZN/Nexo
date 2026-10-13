from urllib.parse import urlencode

from sqlalchemy.exc import IntegrityError

from backend.repository.redis.invitations import InvitationError
from backend.service.auth import RegistrationConflict


class InvitationService:
    ttl_seconds = 7 * 24 * 60 * 60

    def __init__(self, repository, repositories, auth, sessions, settings):
        self.repository, self.repositories = repository, repositories
        self.auth, self.sessions, self.settings = auth, sessions, settings

    def create(self, actor, role):
        token = self.repository.create(role, actor.id, self.ttl_seconds)
        link = self.settings.frontend_url.rstrip("/") + "/admin?" + urlencode({"invite": token})
        return {"url": link, "role": role, "expires_in": self.ttl_seconds}

    def inspect(self, token):
        invite = self.repository.read(token)
        return {"role": invite["role"], "expires_in": self.ttl_seconds}

    def register(self, token, *, name, email, phone, password):
        email = email.strip().lower()
        self.repository.read(token)
        with self.repositories.read_transaction() as repos:
            if repos.users.by_email(email):
                raise RegistrationConflict("Email already registered")
        invite = self.repository.consume(token)
        try:
            user = self.auth.register(name=name, email=email, phone=phone, password=password,
                                      role=invite["role"], status="approved", notify_approval=False)
        except IntegrityError:
            raise RegistrationConflict("Email already registered") from None
        return user, self.sessions.issue(user)

    def register_google(self, token, *, name, email, phone, google_sub):
        email = email.strip().lower()
        with self.repositories.read_transaction() as repos:
            if repos.users.by_email(email) or repos.users.by_google_sub(google_sub):
                raise RegistrationConflict("Account already registered; sign in instead")
        invite = self.repository.consume(token)
        try:
            with self.repositories.transaction() as repos:
                if repos.users.by_email(email) or repos.users.by_google_sub(google_sub):
                    raise RegistrationConflict("Account already registered; sign in instead")
                user = repos.users.create(name=name, email=email, phone=phone,
                                          google_sub=google_sub, role=invite["role"], status="approved")
            return user, self.sessions.issue(user)
        except IntegrityError:
            raise RegistrationConflict("Account already registered; sign in instead") from None


__all__ = ["InvitationError", "InvitationService"]
