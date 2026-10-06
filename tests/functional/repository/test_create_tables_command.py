import os
import sqlite3
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def test_create_tables_command_is_repeatable_and_preserves_data(tmp_path):
    database = tmp_path / "data" / "nexo.db"
    env = dict(os.environ, PYTHONPATH=str(ROOT / "src"), JWT_SECRET_KEY="cli-test-key-" * 4,
               DATABASE_URL="sqlite:///" + str(database))
    script = "from backend.infra.config.settings import Settings; Settings.model_config['env_file']=None; from backend.main import main; main()"
    command = [sys.executable, "-c", script, "create-tables"]
    result = subprocess.run(command, env=env, cwd=tmp_path, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    with sqlite3.connect(database) as db:
        tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        assert tables == {"users", "clients", "notifications", "documents", "chat_messages"}
        db.execute("INSERT INTO users (id,name,email,password_hash,status,role,session_version,created_at,updated_at) VALUES ('test','Test','test@example.com','hash','pending','member',0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)")
    result = subprocess.run(command, env=env, cwd=tmp_path, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    with sqlite3.connect(database) as db:
        assert db.execute("SELECT count(*) FROM users").fetchone()[0] == 1
