# ruff: noqa: F811
from uuid import uuid4

import pytest
from starlette.websockets import WebSocketDisconnect

from tests.functional.controller.test_clients_profiles import ORIGIN, client, login  # noqa: F401


def connect(client, headers):
    response = client.post('/realtime/ticket', headers=headers)
    assert response.status_code == 200
    assert response.headers['cache-control'] == 'no-store'
    return client.websocket_connect('/realtime', headers=dict(ORIGIN), subprotocols=['nexo.v1', response.json()['ticket']])


def receive_type(ws, expected):
    for _ in range(20):
        event = ws.receive_json()
        if event['type'] == expected:
            return event
    raise AssertionError('Expected websocket event not delivered')


def test_websocket_chat_and_notifications_commit_delivery(client):
    services = client.app.state.services
    headers = login(client)
    actor = services.auth.login('owner@example.com', 'initial-admin-password')[0]
    with connect(client, headers) as ws:
        assert ws.receive_json() == {'type': 'ready'}
        user = services.auth.register(name='Chat user', email='chat@example.com', phone='11999999999', password='chat-password-123')
        assert receive_type(ws, 'notifications.changed') == {'type': 'notifications.changed'}
        note = services.approvals.notifications(actor)[0]
        services.approvals.decide(actor, note['id'], 'approved')
        nonce = str(uuid4())
        ws.send_json({'type': 'chat.send', 'member_id': user.id, 'client_id': nonce, 'text': 'Hello realtime'})
        row = receive_type(ws, 'chat.ack')['message']
        assert row['text'] == 'Hello realtime' and row['sender_id'] == actor.id
        assert client.get('/chat/' + user.id + '/messages').json()[0]['id'] == row['id']
        ws.send_json({'type': 'chat.send', 'member_id': user.id, 'client_id': nonce, 'text': 'Hello realtime'})
        assert receive_type(ws, 'chat.ack')['message']['id'] == row['id']
        assert len(client.get('/chat/' + user.id + '/messages').json()) == 1
        response = client.post('/chat/' + user.id + '/media', headers=headers,
            data={'kind': 'audio', 'client_id': str(uuid4())}, files={'file': ('a.wav', b'RIFF0000WAVE123456', 'audio/wav')})
        assert response.status_code == 201 and 'storage_key' not in response.json()
        assert client.get('/chat/media/' + response.json()['id']).content == b'RIFF0000WAVE123456'
        assert client.get('/chat/media/' + response.json()['id']).headers['cache-control'] == 'no-store'
        services.sessions.revoke_all(actor.id)
        with pytest.raises(WebSocketDisconnect) as error:
            while True:
                ws.receive_json()
        assert error.value.code == 4401


def test_ws_origin_ticket_replay_and_malformed_messages(client):
    headers = login(client)
    ticket = client.post('/realtime/ticket', headers=headers).json()['ticket']
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect('/realtime', headers={'Origin': 'https://evil.example'}, subprotocols=['nexo.v1', ticket]):
            pass
    with client.websocket_connect('/realtime', headers=dict(ORIGIN), subprotocols=['nexo.v1', ticket]) as ws:
        assert ws.receive_json()['type'] == 'ready'
        ws.send_text('{bad json')
        assert ws.receive_json()['code'] == 'invalid_message'
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect('/realtime', headers=dict(ORIGIN), subprotocols=['nexo.v1', ticket]):
            pass
    assert client.post('/realtime/ticket', headers=ORIGIN).status_code == 403


def test_pending_realtime_is_limited_to_access_changes(client):
    services = client.app.state.services
    admin = services.auth.login('owner@example.com', 'initial-admin-password')[0]
    member = services.auth.register(name='Pending', email='pending@example.com', phone='11999999999', password='pending-password-123')
    headers = login(client, 'pending@example.com', 'pending-password-123')
    with connect(client, headers) as ws:
        assert ws.receive_json()['type'] == 'ready'
        ws.send_json({'type': 'chat.send', 'member_id': admin.id, 'client_id': str(uuid4()), 'text': 'Not allowed'})
        assert receive_type(ws, 'error')['code'] == 'invalid_message'
        assert client.get('/chat/' + admin.id + '/messages').status_code == 403
        note = services.approvals.notifications(admin)[0]
        services.approvals.decide(admin, note['id'], 'approved')
        assert receive_type(ws, 'account.changed')['type'] == 'account.changed'
        ws.send_json({'type': 'chat.send', 'member_id': admin.id, 'client_id': str(uuid4()), 'text': 'Now allowed'})
        assert receive_type(ws, 'chat.ack')['message']['sender_id'] == member.id


def test_websocket_rate_limit_and_binary_frame_rejection(client):
    headers = login(client)
    client.app.state.settings.ws_message_limit = 1
    with connect(client, headers) as ws:
        assert ws.receive_json()['type'] == 'ready'
        ws.send_text('{bad')
        assert ws.receive_json()['code'] == 'invalid_message'
        ws.send_text('{bad')
        event = ws.receive_json()
        assert event['code'] == 'rate_limit' and event['retry_after'] > 0
        ws.send_bytes(b'not a text command')
        with pytest.raises(WebSocketDisconnect) as error:
            ws.receive_json()
        assert error.value.code == 1003
