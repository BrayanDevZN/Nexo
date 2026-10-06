from sqlalchemy import and_, delete, or_, select
from sqlalchemy.orm import load_only

from backend.repository.db.control.base import pagination
from backend.repository.db.models import ChatMessage


class ChatRepository:
    def __init__(self, session):
        self.session = session

    def get(self, identifier):
        return self.session.scalar(select(ChatMessage).where(ChatMessage.id == identifier))

    def by_client_id(self, sender_id, client_id):
        return self.session.scalar(select(ChatMessage).where(ChatMessage.sender_id == sender_id,
                                                            ChatMessage.client_id == client_id))

    def create(self, **fields):
        row = ChatMessage(**fields)
        self.session.add(row)
        self.session.flush()
        return row

    def list(self, *, actor_id, member_id, before=None, limit=50):
        pagination(limit, 0)
        # The message list shows metadata only.  Do not deserialize image or
        # audio BLOBs until the dedicated media endpoint is requested.
        query = select(ChatMessage).options(load_only(
            ChatMessage.sequence, ChatMessage.id, ChatMessage.sender_id,
            ChatMessage.recipient_id, ChatMessage.sender_name, ChatMessage.client_id,
            ChatMessage.text, ChatMessage.kind, ChatMessage.media_type,
            ChatMessage.size, ChatMessage.created_at,
        )).where(or_(
            and_(ChatMessage.sender_id == actor_id, ChatMessage.recipient_id == member_id),
            and_(ChatMessage.sender_id == member_id, ChatMessage.recipient_id == actor_id)))
        if before is not None:
            query = query.where(ChatMessage.sequence < before)
        return list(reversed(list(self.session.scalars(query.order_by(ChatMessage.sequence.desc()).limit(limit)))))

    def delete_for_user(self, identifier):
        clause = or_(ChatMessage.sender_id == identifier, ChatMessage.recipient_id == identifier)
        keys = list(self.session.scalars(select(ChatMessage.storage_key).where(clause, ChatMessage.storage_key.is_not(None))))
        result = self.session.execute(delete(ChatMessage).where(clause))
        if result.rowcount:
            self.session.info.setdefault("cache_dirty_tables", set()).add("chat_messages")
        return keys
