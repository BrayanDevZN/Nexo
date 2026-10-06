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
        self._in_memory = url.database in {None, "", ":memory:"}
        self._sqlite_timeout_ms = int(settings.sqlite_timeout_seconds * 1000)
        if not self._in_memory:
            Path(url.database).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)
        options = {"poolclass": StaticPool} if self._in_memory else {}
        self.engine = create_engine(
            url, connect_args={"check_same_thread": False,
                               "timeout": settings.sqlite_timeout_seconds},
            # A SQLite file is local to the process.  A pre-ping would add a
            # SELECT before every checkout without protecting a network hop.
            pool_pre_ping=False, **options,
        )
        event.listen(self.engine, "connect", self._configure_sqlite)
        self.sessions = sessionmaker(bind=self.engine, expire_on_commit=False)

    def _configure_sqlite(self, connection, _record):
        cursor = connection.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute(f"PRAGMA busy_timeout={self._sqlite_timeout_ms}")
            cursor.execute("PRAGMA temp_store=MEMORY")
            # WAL lets normal dashboard/list reads continue while a short
            # mutation is being committed.  It is persistent for file-backed
            # SQLite databases and does not weaken durability settings.
            if not self._in_memory:
                cursor.execute("PRAGMA journal_mode=WAL")
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

    @contextmanager
    def read_session(self):
        """Read-only session boundary that never performs an unnecessary commit."""
        with self.sessions() as session:
            try:
                yield session
            finally:
                # Closing an SQLAlchemy session would roll this back too, but
                # doing it explicitly releases SQLite's read transaction now.
                # Detach loaded rows first so safe read services can return a
                # fully loaded snapshot without rollback expiring its fields.
                session.expunge_all()
                session.rollback()

    def ping(self) -> bool:
        with self.engine.connect() as connection:
            return connection.execute(text("SELECT 1")).scalar_one() == 1

    def close(self) -> None:
        self.engine.dispose()
