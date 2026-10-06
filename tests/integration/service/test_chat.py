# ruff: noqa: F811
from uuid import uuid4

import pytest

from backend.service.access import AccessDenied, ResourceConflict
from tests.integration.service.test_members import owner, registered, runtime  # noqa: F401


def test_chat_persistence_cache_retry_and_member_privacy(runtime):
    admin, member = owner(runtime), registered(runtime)[0]
    assert runtime.chat.history(admin, member.id) == []
    nonce = str(uuid4())
    row = runtime.chat.send(admin, member.id, nonce, 'Hello')
    assert runtime.chat.send(admin, member.id, nonce, 'Hello')['id'] == row['id']
    assert runtime.chat.history(member, admin.id)[0]['text'] == 'Hello'
    second = runtime.chat.send(member, admin.id, str(uuid4()), 'Reply')
    assert runtime.chat.history(admin, member.id, before=second['sequence']) == [row]
    photo = runtime.chat.upload(member, admin.id, str(uuid4()), 'audio', 'audio/wav', b'RIFF0000WAVE' + b'0' * 20)
    assert 'storage_key' not in photo
    assert runtime.chat.media(admin, photo['id'])[1] == 'audio/wav'
    with runtime.repositories.transaction() as repos:
        third = repos.users.create(name='Third', email='third@example.com', phone='11999999999',
                                         password_hash=runtime.passwords.hash('third-password-123'), status='approved')
    with pytest.raises(AccessDenied):
        runtime.chat.media(third, photo['id'])
    assert runtime.chat.history(third, admin.id) == []
    with pytest.raises(ResourceConflict):
        runtime.chat.send(admin, third.id, nonce, 'Another')
    runtime.members.delete(admin, member.id)
    assert not list(runtime.chat.storage.root.iterdir())


def test_realtime_tickets_single_use_origin_limits_and_revocation(runtime):
    actor, token = runtime.auth.login('owner@example.com', 'initial-admin-password')
    claims = runtime.tokens.read(token)
    ticket = runtime.events.issue_ticket(claims, 'https://site.example')
    payload = runtime.events.consume_ticket(ticket, 'https://site.example')
    assert payload and runtime.realtime.authenticate(payload).id == actor.id
    assert runtime.events.consume_ticket(ticket, 'https://site.example') is None
    ticket = runtime.events.issue_ticket(claims, 'https://site.example')
    assert runtime.events.consume_ticket(ticket, 'https://other.example') is None
    assert runtime.events.acquire(actor.id, 'first', 1)
    assert not runtime.events.acquire(actor.id, 'second', 1)
    runtime.events.release(actor.id, 'first')
    assert runtime.events.acquire(actor.id, 'second', 1)
    runtime.events.release(actor.id, 'second')
    runtime.sessions.revoke_all(actor.id)
    with pytest.raises(AccessDenied):
        runtime.realtime.authenticate(payload)


def test_unread_chat_count_clears_when_conversation_is_opened(runtime):
    admin, (member, _) = owner(runtime), registered(runtime)
    assert runtime.announcements.unread_counts(member) == {"total": 0, "chat_messages": 0}

    runtime.chat.send(admin, member.id, str(uuid4()), "Nova mensagem")

    assert runtime.announcements.unread_counts(member) == {"total": 1, "chat_messages": 1}
    assert runtime.announcements.mark_chat_read(member, admin.id) == 1
    assert runtime.announcements.unread_counts(member) == {"total": 0, "chat_messages": 0}
