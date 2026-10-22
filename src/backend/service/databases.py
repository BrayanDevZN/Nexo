import os
import sqlite3
import time
from contextlib import closing
from pathlib import Path
from urllib.parse import quote

from sqlalchemy.engine import make_url

from backend.domain.roles import DEVELOPERS
from backend.service.access import AccessDenied, authorize

MAX_ROWS = 200
MAX_SQL_LENGTH = 10_000
MAX_CELL_LENGTH = 2_000
QUERY_TIMEOUT_SECONDS = 5

# Columns whose contents never leave the server through the SQL console.
# SQLite returns NULL for them, so ``SELECT *`` still works.
HIDDEN_COLUMNS = {
    ("users", "password_hash"), ("users", "google_sub"), ("users", "profile_photo_data"),
    ("api_keys", "key_hash"),
    ("chat_messages", "text"), ("chat_messages", "media_data"),
    ("documents", "content"),
}
TABLES_SQL = "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"


class QueryRejected(ValueError):
    pass


class DatabaseAdminService:
    """Instance overview and a read-only SQL console, restricted to developers and above."""

    def __init__(self, repositories, settings, redis_client, qdrant):
        self.repositories, self.settings = repositories, settings
        self.redis, self.qdrant = redis_client, qdrant
        self.path = Path(make_url(settings.database_url).database or "").expanduser()

    def _check(self, actor):
        with self.repositories.read_transaction() as repos:
            user = authorize(repos, actor, approved=True)
            if user.role not in DEVELOPERS:
                raise AccessDenied("Developer access required")

    def _connect(self) -> sqlite3.Connection:
        if not self.path.name or not self.path.exists():
            raise QueryRejected("Banco SQLite indisponível")
        uri = "file:" + quote(str(self.path.resolve())) + "?mode=ro"
        connection = sqlite3.connect(uri, uri=True, timeout=QUERY_TIMEOUT_SECONDS)
        connection.execute("PRAGMA query_only=ON")
        return connection

    @staticmethod
    def _authorizer(action, arg1, arg2, _database, _trigger):
        if action in {sqlite3.SQLITE_SELECT, sqlite3.SQLITE_FUNCTION, sqlite3.SQLITE_RECURSIVE}:
            return sqlite3.SQLITE_OK
        if action == sqlite3.SQLITE_READ:
            return sqlite3.SQLITE_IGNORE if (arg1, arg2) in HIDDEN_COLUMNS else sqlite3.SQLITE_OK
        return sqlite3.SQLITE_DENY

    def _sqlite(self) -> dict:
        info = {"id": "sqlite", "name": "SQLite (banco da Nexo)", "kind": "sqlite", "status": "online",
                "details": {"arquivo": self.path.name}, "tables": [], "can_query": True, "dashboard_url": None}
        try:
            with closing(self._connect()) as connection:
                info["details"]["tamanho_bytes"] = os.path.getsize(self.path)
                for (name,) in connection.execute(TABLES_SQL).fetchall():
                    quoted = '"' + name.replace('"', '""') + '"'
                    columns = [row[1] for row in connection.execute(f"PRAGMA table_info({quoted})")]
                    count = connection.execute(f"SELECT COUNT(*) FROM {quoted}").fetchone()[0]
                    info["tables"].append({"name": name, "rows": count, "columns": columns})
        except (sqlite3.Error, OSError, QueryRejected):
            info["status"] = "unreachable"
        return info

    def _redis(self) -> dict:
        info = {"id": "redis", "name": "Redis (sessões, cache e filas)", "kind": "redis", "status": "online",
                "details": {}, "tables": [], "can_query": False, "dashboard_url": None}
        try:
            server = self.redis.info()
            info["details"] = {
                "versao": server.get("redis_version"), "memoria": server.get("used_memory_human"),
                "clientes_conectados": server.get("connected_clients"), "chaves": self.redis.dbsize(),
            }
        except Exception:
            info["status"] = "unreachable"
        return info

    def _qdrant(self) -> dict | None:
        if not self.qdrant.configured:
            return None
        overview = self.qdrant.overview()
        return {"id": "qdrant", "name": "Qdrant (banco vetorial)", "kind": "qdrant", "status": overview["status"],
                "details": {"versao": overview["version"], "colecoes": overview["collections_total"]},
                "tables": [{"name": item["name"], "rows": item["points_count"], "columns": []}
                           for item in overview["collections"]],
                "can_query": False, "dashboard_url": self.qdrant.dashboard_url}

    def instances(self, actor) -> list[dict]:
        self._check(actor)
        return [item for item in (self._sqlite(), self._redis(), self._qdrant()) if item]

    def query(self, actor, sql: str) -> dict:
        self._check(actor)
        sql = (sql or "").strip().rstrip(";").strip()
        if not sql or len(sql) > MAX_SQL_LENGTH:
            raise QueryRejected("Informe uma consulta com até 10.000 caracteres")
        connection = self._connect()
        deadline = time.monotonic() + QUERY_TIMEOUT_SECONDS
        connection.set_progress_handler(lambda: 1 if time.monotonic() > deadline else 0, 10_000)
        connection.set_authorizer(self._authorizer)
        try:
            cursor = connection.execute(sql)
            columns = [column[0] for column in cursor.description or []]
            rows = cursor.fetchmany(MAX_ROWS + 1)
        except sqlite3.Warning:
            raise QueryRejected("Execute uma consulta por vez") from None
        except sqlite3.Error as error:
            raise QueryRejected(self._message(error)) from None
        finally:
            connection.close()
        return {"columns": columns, "rows": [[self._cell(value) for value in row] for row in rows[:MAX_ROWS]],
                "truncated": len(rows) > MAX_ROWS}

    @staticmethod
    def _message(error: sqlite3.Error) -> str:
        text = str(error)
        if "not authorized" in text or "readonly" in text.lower():
            return "Somente consultas de leitura (SELECT) são permitidas."
        if "interrupted" in text:
            return "A consulta demorou mais de 5 segundos e foi interrompida."
        return text[:300]

    @staticmethod
    def _cell(value):
        if isinstance(value, bytes):
            return f"<binário, {len(value)} bytes>"
        if isinstance(value, str) and len(value) > MAX_CELL_LENGTH:
            return value[:MAX_CELL_LENGTH] + "…"
        return value
