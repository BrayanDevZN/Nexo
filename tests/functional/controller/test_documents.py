# ruff: noqa: F811
from tests.conftest import verified_register
from tests.functional.controller.test_clients_profiles import (  # noqa: F401
    DATA,
    ORIGIN,
    client,
    login,
    photo,
)


def test_document_endpoints_and_client_search(client):
    assert client.get('/documents').status_code == 401
    headers = login(client)
    assert client.post('/documents', files={'file': ('test.txt', b'Hello')}, headers=ORIGIN).status_code == 403
    response = client.post('/documents', files={'file': ('../../test.txt', b'Hello')}, headers=headers)
    assert response.status_code == 201
    row = response.json()
    assert row['filename'] == 'test.txt' and row['created_by_name']
    assert 'storage_key' not in row and 'password' not in row
    assert client.get('/documents').json()[0] == row
    path = '/documents/' + row['id']
    response = client.get(path + '/download')
    assert response.content == b'Hello'
    assert response.headers['content-disposition'].startswith('attachment;')
    assert response.headers['cache-control'] == 'no-store'
    assert client.post('/documents', files={'file': ('x.html', b'<script>')}, headers=headers).status_code == 400
    client.app.state.services.documents.max_bytes = 4
    client.app.state.settings.document_max_bytes = 4
    assert client.post('/documents', files={'file': ('x.txt', b'12345')}, headers=headers).status_code == 413
    assert client.delete(path, headers=headers).status_code == 204
    assert client.get(path + '/download').status_code == 404
    creator = client.get('/auth/me').json()['id']
    result = client.post('/clients', headers=headers, json={'name': 'Nexo % Loja', 'niche': 'Varejo'}).json()
    assert result['created_by_name']
    for filters in [{'name': 'nexo', 'created_by_id': creator, 'niche': 'Varejo'}, {'name': '%'}]:
        assert client.get('/clients', params=filters).json()[0]['id'] == result['id']
    for filters in [{'name': 'other'}, {'created_by_id': 'other'}, {'niche': 'Other'}]:
        assert client.get('/clients', params=filters).json() == []


def test_member_photos_and_pending_document_access(client):
    headers = login(client)
    admin_id = client.get('/auth/me').json()['id']
    assert client.put('/auth/profile/photo', headers=headers, files=photo()).status_code == 200
    assert next(row for row in client.get('/members').json() if row['id'] == admin_id)['has_photo']
    assert client.get('/members/' + admin_id + '/photo').headers['content-type'] == 'image/jpeg'
    assert verified_register(client, json=DATA, headers=ORIGIN).status_code == 201
    headers = login(client, DATA['email'], DATA['password'])
    assert client.get('/members/' + admin_id + '/photo').status_code == 403
    assert client.get('/documents').status_code == 403
    assert client.post('/documents', files={'file': ('x.txt', b'x')}, headers=headers).status_code == 403
