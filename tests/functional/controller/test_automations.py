# Ruff treats pytest fixture re-exports as duplicate arguments.
# ruff: noqa: F811
from tests.functional.controller.test_clients_profiles import client, login  # noqa: F401


def test_automation_library_endpoints_support_session_and_api_key(client):
    session = login(client)
    key_response = client.post("/auth/api-keys", headers=session, json={"name": "automation test"})
    assert key_response.status_code == 201
    key = key_response.json()["key"]
    headers = {"Authorization": f"Bearer {key}"}

    response = client.post("/automations", headers=headers, data={
        "name": "Leads", "description": "Importa leads."},
        files={"file": ("leads.json", b'{"nodes": []}', "application/json")})
    assert response.status_code == 201, response.text
    automation = response.json()
    assert automation["name"] == "Leads" and automation["has_image"] is False
    assert client.get("/automations", headers=headers).json()[0]["id"] == automation["id"]
    download = client.get(f"/automations/{automation['id']}/download", headers=headers)
    assert download.content == b'{"nodes": []}'
    assert download.headers["content-disposition"].endswith("leads.json")

    notices = client.get("/notifications", headers=session).json()
    assert any(note["title"] == "Nova automação disponível: Leads" for note in notices)
    update = client.patch(f"/automations/{automation['id']}", headers=headers, data={
        "name": "Leads atualizados", "description": "Atualização via API."})
    assert update.status_code == 200, update.text
    assert update.json()["name"] == "Leads atualizados"
    delete = client.delete(f"/automations/{automation['id']}", headers=headers)
    assert delete.status_code == 200 and delete.json()["deleted"] is True
    notices = client.get("/notifications", headers=session).json()
    assert any(note["title"] == "Automação atualizada: Leads atualizados" for note in notices)
    assert any(note["title"] == "Automação excluída: Leads atualizados" for note in notices)
    client.cookies.clear()
    assert client.get("/automations").status_code == 401


def test_automation_rejects_unsupported_file_and_api_keys_only_access(client):
    session = login(client)
    key = client.post("/auth/api-keys", headers=session, json={"name": "automation test"}).json()["key"]
    response = client.post("/automations", headers={"Authorization": f"Bearer {key}"},
                           data={"name": "Bad file", "description": "Nope"},
                           files={"file": ("workflow.exe", b"not an automation")})
    assert response.status_code == 400
    assert client.get("/automations").status_code == 200


def test_api_key_validate_route_accepts_only_valid_api_keys(client):
    session = login(client)
    key = client.post("/auth/api-keys", headers=session, json={"name": "maps"}).json()["key"]

    ok = client.get("/auth/api-keys/validate", headers={"Authorization": f"Bearer {key}"})
    assert ok.status_code == 200 and ok.json() == {"valid": True}

    bad = client.get("/auth/api-keys/validate", headers={"Authorization": "Bearer nexo_live_wrong"})
    assert bad.status_code == 401
    # A logged-in session without an API key is not accepted.
    assert client.get("/auth/api-keys/validate", headers=session).status_code == 401
    client.cookies.clear()
    assert client.get("/auth/api-keys/validate").status_code == 401
