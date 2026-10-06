from sqlalchemy import select, update

from backend.repository.db.control.base import Repository, pagination
from backend.repository.db.models import User


class UserRepository(Repository[User]):
    model = User

    def __init__(self, session, principal_email=None):
        super().__init__(session)
        self.principal_email = str(principal_email).lower() if principal_email else None

    def create(self, *, name: str, email: str, phone: str | None = None,
               password_hash: str | None = None, google_sub: str | None = None,
               role: str = "member", status: str = "pending") -> User:
        if not name.strip() or not email.strip():
            raise ValueError("Name and email are required")
        return self.add(User(name=name.strip(), email=email.strip().lower(), phone=phone,
                             password_hash=password_hash, google_sub=google_sub,
                             role=role, status=status))

    def by_email(self, email: str) -> User | None:
        return self.session.scalar(select(User).where(User.email == email.strip().lower()))

    def principal_admin(self) -> User | None:
        query = select(User).where(User.role == "admin")
        if self.principal_email:
            query = query.where(User.email == self.principal_email)
        return self.session.scalar(query.order_by(User.created_at, User.id))

    def by_google_sub(self, subject: str) -> User | None:
        return self.session.scalar(select(User).where(User.google_sub == subject))

    def list(self, *, status: str | None = None, limit: int = 50, offset: int = 0) -> list[User]:
        pagination(limit, offset)
        query = select(User).order_by(User.created_at, User.id)
        if status is not None:
            query = query.where(User.status == status)
        return list(self.session.scalars(query.limit(limit).offset(offset)))

    def set_status(self, user: User, status: str) -> None:
        if status not in {"pending", "approved", "rejected"}:
            raise ValueError("Invalid status")
        user.status = status
        self.revoke_sessions(user)

    def set_password(self, user: User, password_hash: str) -> None:
        if not password_hash:
            raise ValueError("Password hash is required")
        user.password_hash = password_hash
        self.revoke_sessions(user)

    def update_profile(self, user: User, *, name: str, phone: str | None,
                       profile_photo: str | None) -> None:
        if not name.strip():
            raise ValueError("Name is required")
        user.name, user.phone, user.profile_photo = name.strip(), phone, profile_photo
        self.session.flush()

    def revoke_sessions(self, user: User) -> None:
        self.session.flush()
        self.session.execute(update(User).where(User.id == user.id).values(
            session_version=User.session_version + 1,
        ), execution_options={"synchronize_session": False})
        self.session.info.setdefault("cache_dirty_tables", set()).add("users")
        self.session.refresh(user)


    def decide_pending(self, user: User, decision: str) -> bool:
        if decision not in {"approved", "rejected"}:
            raise ValueError("Invalid decision")
        result = self.session.execute(update(User).where(
            User.id == user.id, User.status == "pending", User.role == "member"
        ).values(status=decision, session_version=User.session_version + int(decision == "rejected")),
            execution_options={"synchronize_session": False})
        self.session.info.setdefault("cache_dirty_tables", set()).add("users")
        self.session.refresh(user)
        return result.rowcount == 1


    def replace_password_if_current(self, identifier: str, version: int, hashed: str) -> bool:
        if not hashed:
            raise ValueError("Password hash is required")
        result = self.session.execute(update(User).where(
            User.id == identifier, User.session_version == version,
            User.status.in_(["pending", "approved"]), User.password_hash.is_not(None)
        ).values(password_hash=hashed, session_version=User.session_version + 1),
            execution_options={"synchronize_session": False})
        if result.rowcount:
            self.session.info.setdefault("cache_dirty_tables", set()).add("users")
        return result.rowcount == 1


    def set_profile_fields(self, user: User, *, name: str, phone: str) -> bool:
        if not name.strip() or not phone:
            raise ValueError("Name and phone are required")
        result = self.session.execute(update(User).where(
            User.id == user.id, User.session_version == user.session_version,
            User.status.in_(["pending", "approved"])
        ).values(name=name.strip(), phone=phone), execution_options={"synchronize_session": False})
        self.session.info.setdefault("cache_dirty_tables", set()).add("users")
        self.session.refresh(user)
        return result.rowcount == 1

    def set_photo_if_current(self, user: User, *, previous: str | None, photo: str | None) -> bool:
        result = self.session.execute(update(User).where(
            User.id == user.id, User.session_version == user.session_version,
            User.status.in_(["pending", "approved"]), User.profile_photo == previous
        ).values(profile_photo=photo), execution_options={"synchronize_session": False})
        self.session.info.setdefault("cache_dirty_tables", set()).add("users")
        self.session.refresh(user)
        return result.rowcount == 1

    def update_member_if_current(self, user, changes):
        allowed = {"name", "email", "phone", "role"}
        if not changes or set(changes) - allowed:
            raise ValueError("Unsupported member fields")
        values = dict(changes)
        if any(field in changes and changes[field] != getattr(user, field) for field in ("email", "role")):
            values["session_version"] = User.session_version + 1
        result = self.session.execute(update(User).where(
            User.id == user.id, User.session_version == user.session_version
        ).values(**values), execution_options={"synchronize_session": False})
        self.session.info.setdefault("cache_dirty_tables", set()).add("users")
        self.session.refresh(user)
        return result.rowcount == 1
