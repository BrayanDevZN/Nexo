import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from backend.controller.application import create_app
from backend.domain.passwords import PasswordHasher

ORIGIN = {"Origin": "http://localhost:5173"}
PASSWORD = "another-strong-password"


@pytest.fixture
def client(settings, local_redis_url, monkeypatch):
    settings.redis_url = SecretStr(local_redis_url)
    settings.email = "owner@example.com"
    settings.password = SecretStr("initial-admin-password")
    settings.qdrant_url = None
    monkeypatch.setattr("backend.service.runtime.PasswordHasher", lambda: PasswordHasher(rounds=4))
    with TestClient(create_app(settings)) as test_client:
        yield test_client


def sign_in(client, email="owner@example.com", password="initial-admin-password"):
    client.cookies.clear()
    assert client.post("/auth/login", headers=ORIGIN, json={"email": email, "password": password}).status_code == 200
    return {**ORIGIN, "X-CSRF-Token": client.get("/auth/csrf").json()["csrf_token"]}


def add_member(client, role):
    services = client.app.state.services
    with services.repositories.transaction() as repos:
        repos.users.create(name=role.title(), email=role + "@example.com", status="approved", role=role,
                           password_hash=services.passwords.hash(PASSWORD))


def test_developers_list_instances_and_run_read_only_queries(client):
    add_member(client, "dev")
    headers = sign_in(client, "dev@example.com", PASSWORD)
    listing = client.get("/admin/databases")
    assert listing.status_code == 200
    by_id = {item["id"]: item for item in listing.json()}
    assert set(by_id) == {"sqlite", "redis"} and by_id["sqlite"]["can_query"] is True
    assert {table["name"] for table in by_id["sqlite"]["tables"]} >= {"users", "clients"}
    result = client.post("/admin/databases/sqlite/query", headers=headers,
                         json={"sql": "SELECT name, role, password_hash FROM users ORDER BY name"})
    assert result.status_code == 200
    body = result.json()
    assert body["columns"] == ["name", "role", "password_hash"]
    assert sorted(row[1] for row in body["rows"]) == ["dev", "owner"]
    assert all(row[2] is None for row in body["rows"])


@pytest.mark.parametrize("sql", [
    "DELETE FROM clients", "UPDATE users SET role = 'owner'", "DROP TABLE users",
    "INSERT INTO clients (name) VALUES ('x')", "PRAGMA writable_schema = ON",
    "ATTACH DATABASE '/tmp/other.db' AS other", "SELECT 1; SELECT 2",
])
def test_the_console_rejects_anything_but_one_select(client, sql):
    headers = sign_in(client)
    response = client.post("/admin/databases/sqlite/query", headers=headers, json={"sql": sql})
    assert response.status_code == 400
    with client.app.state.services.repositories.read_transaction() as repos:
        assert repos.users.by_email("owner@example.com").role == "owner"


def test_private_columns_stay_hidden_and_commercial_members_are_blocked(client):
    add_member(client, "commercial")
    owner = sign_in(client)
    messages = client.post("/admin/databases/sqlite/query", headers=owner,
                           json={"sql": "SELECT google_sub, password_hash FROM users"}).json()
    assert all(value is None for row in messages["rows"] for value in row)
    blocked = sign_in(client, "commercial@example.com", PASSWORD)
    assert client.get("/admin/databases").status_code == 403
    assert client.post("/admin/databases/sqlite/query", headers=blocked, json={"sql": "SELECT 1"}).status_code == 403


def test_anonymous_visitors_cannot_reach_the_databases(client):
    assert client.get("/admin/databases").status_code == 401
