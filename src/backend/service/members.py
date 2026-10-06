from sqlalchemy.exc import IntegrityError

from backend.repository.cache.queries import snapshot
from backend.service.access import AccessDenied, ResourceConflict, ResourceNotFound, authorize


class MemberService:
    def __init__(self, repositories, cached_repositories, profiles):
        self.repositories, self.cached_repositories, self.profiles = repositories, cached_repositories, profiles

    @staticmethod
    def _authorize(repos, actor):
        current = authorize(repos, actor, approved=True)
        if current.role != "admin":
            raise AccessDenied("Administrator access required")

    @staticmethod
    def _target(repos, identifier):
        user = repos.users.get(identifier)
        if user is None:
            raise ResourceNotFound("Member not found")
        return user

    def directory(self, actor, *, limit=50, offset=0):
        with self.cached_repositories.transaction() as repos:
            authorize(repos.db, actor, approved=True)
            # Explicit allowlist: shared directory never contains contact or authentication data.
            return [{key: row[key] for key in ("id", "name", "role")}
                    for row in repos.users.list(status="approved", limit=limit, offset=offset)]

    def users(self, actor, **filters):
        with self.cached_repositories.transaction() as repos:
            self._authorize(repos.db, actor)
            principal = repos.db.users.principal_admin()
            return [{**row, "is_principal": bool(principal and row["id"] == principal.id)}
                    for row in repos.users.list(**filters)]

    def update(self, actor, identifier, changes):
        if not changes or set(changes) - {"name", "email", "phone", "role"}:
            raise ValueError("Unsupported member fields")
        try:
            with self.repositories.transaction() as repos:
                self._authorize(repos, actor)
                user = self._target(repos, identifier)
                principal = repos.users.principal_admin()
                if principal and principal.id == user.id:
                    if (("email" in changes and changes["email"] != user.email)
                            or ("role" in changes and changes["role"] != "admin")):
                        raise ResourceConflict("Principal administrator email and role are protected")
                if "role" in changes and user.status != "approved":
                    raise ResourceConflict("Only approved members can change role")
                if actor.id == user.id and changes.get("role", user.role) != "admin":
                    raise ResourceConflict("You cannot remove your own administrator role")
                if not repos.users.update_member_if_current(user, changes):
                    raise ResourceConflict("Member changed; try again")
                return {**snapshot("users", user), "is_principal": bool(principal and user.id == principal.id)}
        except IntegrityError:
            raise ResourceConflict("Email already registered") from None

    @staticmethod
    def _remove(repos, user):
        principal = repos.users.principal_admin()
        if principal is None:
            raise ResourceConflict("Principal administrator is unavailable")
        if principal.id == user.id:
            raise ResourceConflict("Principal administrator cannot be deleted")
        repos.clients.transfer_creator(user.id, principal.id)
        repos.notifications.delete_for_user(user.id)
        repos.users.delete(user.id)
        return user.profile_photo

    def remove_self(self, actor):
        with self.repositories.transaction() as repos:
            user = authorize(repos, actor)
            previous_photo = self._remove(repos, user)
        self.profiles.cleanup_photo(previous_photo)

    def delete(self, actor, identifier):
        with self.repositories.transaction() as repos:
            self._authorize(repos, actor)
            user = self._target(repos, identifier)
            if actor.id == user.id:
                raise ResourceConflict("You cannot delete your own account")
            previous_photo = self._remove(repos, user)
        self.profiles.cleanup_photo(previous_photo)
