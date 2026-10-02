from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.infra.config.settings import Settings


class DatabaseConnection:
    def __init__(self, settings: Settings):
        url = make_url(settings.database_url)
        in_memory = url.database in {None, "", ":memory:"}
        if not in_memory:
            Path(url.database).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)
        options = {"poolclass": StaticPool} if in_memory else {}
        self.engine = create_engine(
            url, connect_args={"check_same_thread": False,
                               "timeout": settings.sqlite_timeout_seconds},
            pool_pre_ping=True, **options,
        )
        event.listen(self.engine, "connect", self._configure_sqlite)
        self.sessions = sessionmaker(bind=self.engine, expire_on_commit=False)

    @staticmethod
    def _configure_sqlite(connection, _record):
        cursor = connection.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys=ON")
        finally:
            cursor.close()

    @contextmanager
    def session(self):
        """One session per operation; commit on success, rollback on error."""
        with self.sessions() as session:
            try:
                yield session
                session.commit()
            except BaseException:
                session.rollback()
                raise

    def ping(self) -> bool:
        with self.engine.connect() as connection:
            return connection.execute(text("SELECT 1")).scalar_one() == 1

    def close(self) -> None:
        self.engine.dispose()
