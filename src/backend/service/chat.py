import logging

from sqlalchemy.exc import IntegrityError

from backend.domain.chat import normalize_media
from backend.repository.cache.queries import snapshot
from backend.service.access import AccessDenied, ResourceConflict, ResourceNotFound, authorize

logger = logging.getLogger(__name__)


class ChatService:
    def __init__(self, repositories, cached_repositories, storage, events, settings):
        self.repositories, self.cached_repositories = repositories, cached_repositories
        self.storage, self.events, self.settings = storage, events, settings

    @staticmethod
    def participants(repos, actor, member_id):
        user = authorize(repos, actor, approved=True)
        recipient = repos.users.get(member_id)
        if recipient is None or recipient.status != "approved" or recipient.id == user.id:
            raise ResourceNotFound("Approved member not found")
        return user, recipient

    def history(self, actor, member_id, *, before=None, limit=50):
        with self.cached_repositories.transaction() as repos:
            self.participants(repos.db, actor, member_id)
            return repos.chat_messages.list(actor_id=actor.id, member_id=member_id, before=before, limit=limit)

    @staticmethod
    def duplicate(repos, actor, member_id, client_id):
        row = repos.chat_messages.by_client_id(actor.id, client_id)
        if row is not None and row.recipient_id != member_id:
            raise ResourceConflict("Client message ID already used")
        return snapshot("chat_messages", row)

    def save(self, actor, member_id, client_id, **fields):
        try:
            with self.repositories.transaction() as repos:
                user, recipient = self.participants(repos, actor, member_id)
                existing = self.duplicate(repos, actor, member_id, client_id)
                if existing:
                    return existing, False
                row = repos.chat_messages.create(sender_id=user.id, sender_name=user.name,
                    recipient_id=recipient.id, client_id=client_id, **fields)
                result = snapshot("chat_messages", row)
        except IntegrityError:
            with self.repositories.transaction() as repos:
                self.participants(repos, actor, member_id)
                existing = self.duplicate(repos, actor, member_id, client_id)
                if not existing:
                    raise
                return existing, False
        return result, True

    def broadcast(self, row):
        try:
            self.events.publish({"type": "chat.message", "message": row}, [row["sender_id"], row["recipient_id"]])
        except Exception:
            logger.warning("Chat realtime delivery unavailable; message remains in database")

    def send(self, actor, member_id, client_id, text):
        if not isinstance(text, str) or not text.strip() or len(text) > 4000:
            raise ValueError("Message must have 1 to 4000 characters")
        row, _ = self.save(actor, member_id, client_id, text=text.strip(), kind="text")
        self.broadcast(row)
        return row

    def upload(self, actor, member_id, client_id, kind, media_type, data):
        with self.repositories.transaction() as repos:
            self.participants(repos, actor, member_id)
        data, media_type = normalize_media(kind, media_type, data, self.settings)
        key = self.storage.write(data)
        try:
            row, created = self.save(actor, member_id, client_id, kind=kind, storage_key=key,
                                     media_type=media_type, media_data=data, size=len(data))
        except BaseException:
            self.cleanup([key])
            raise
        if not created:
            self.cleanup([key])
        self.broadcast(row)
        return row

    def media(self, actor, identifier):
        with self.repositories.transaction() as repos:
            user = authorize(repos, actor, approved=True)
            row = repos.chat_messages.get(identifier)
            if row is None or not row.storage_key:
                raise ResourceNotFound("Media not found")
            if user.id not in {row.sender_id, row.recipient_id}:
                raise AccessDenied("Conversation is private")
            key, media_type, data = row.storage_key, row.media_type, row.media_data
        if data is not None:
            return data, media_type
        try:
            return self.storage.read(key), media_type
        except FileNotFoundError:
            raise ResourceNotFound("Media not found") from None

    def cleanup(self, keys):
        for key in keys:
            try:
                self.storage.delete(key)
            except OSError:
                logger.warning("Chat media cleanup failed")
