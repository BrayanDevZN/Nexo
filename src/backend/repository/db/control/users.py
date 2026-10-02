from sqlalchemy import select

from backend.repository.db.control.base import Repository, pagination
from backend.repository.db.models import User


class UserRepository(Repository[User]):
    model = User

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
        user.session_version += 1
        self.session.flush()

    def set_password(self, user: User, password_hash: str) -> None:
        if not password_hash:
            raise ValueError("Password hash is required")
        user.password_hash = password_hash
        user.session_version += 1
        self.session.flush()

    def update_profile(self, user: User, *, name: str, phone: str | None,
                       profile_photo: str | None) -> None:
        if not name.strip():
            raise ValueError("Name is required")
        user.name, user.phone, user.profile_photo = name.strip(), phone, profile_photo
        self.session.flush()
