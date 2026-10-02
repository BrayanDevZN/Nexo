from typing import Generic, TypeVar

from sqlalchemy.orm import Session

from backend.repository.db.models.base import Base

Model = TypeVar("Model", bound=Base)


def pagination(limit: int, offset: int) -> None:
    if not 1 <= limit <= 100 or offset < 0:
        raise ValueError("limit must be 1..100 and offset must be nonnegative")


class Repository(Generic[Model]):
    model: type[Model]

    def __init__(self, session: Session):
        self.session = session

    def get(self, identifier: str) -> Model | None:
        return self.session.get(self.model, identifier)

    def add(self, row: Model) -> Model:
        self.session.add(row)
        self.session.flush()
        return row

    def delete(self, identifier: str) -> bool:
        row = self.get(identifier)
        if row is None:
            return False
        self.session.delete(row)
        self.session.flush()
        return True
