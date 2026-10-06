import hashlib
import json
import secrets
import time

LEASE = """
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then return 0 end
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[4])
redis.call('EXPIRE', KEYS[1], 60)
return 1
"""


class RealtimeRepository:
    def __init__(self, redis, prefix):
        self.redis, self.prefix = redis, prefix

    def channel(self, user_id=None):
        return self.prefix + ":events:" + (user_id or "all")

    def publish(self, event, user_ids=None):
        payload = json.dumps(event)
        for user_id in set(user_ids or [None]):
            self.redis.publish(self.channel(user_id), payload)

    def ticket_key(self, ticket):
        return self.prefix + ":ticket:" + hashlib.sha256(ticket.encode()).hexdigest()

    def issue_ticket(self, claims, origin):
        ticket = secrets.token_urlsafe(32)
        payload = {"id": claims.user_id, "session_version": claims.session_version,
                   "expires_at": claims.expires_at, "origin": origin}
        self.redis.set(self.ticket_key(ticket), json.dumps(payload), ex=30)
        return ticket

    def consume_ticket(self, ticket, origin):
        if not isinstance(ticket, str) or len(ticket) != 43:
            return None
        raw = self.redis.getdel(self.ticket_key(ticket))
        if raw is None:
            return None
        payload = json.loads(raw)
        return payload if payload["origin"] == origin and payload["expires_at"] > time.time() else None

    def acquire(self, user_id, connection_id, limit):
        now = time.time()
        return bool(self.redis.eval(LEASE, 1, self.prefix + ":connections:" + user_id,
                                    now, now + 45, limit, connection_id))

    def renew(self, user_id, connection_id):
        key = self.prefix + ":connections:" + user_id
        with self.redis.pipeline() as pipeline:
            pipeline.zadd(key, {connection_id: time.time() + 45}, xx=True)
            pipeline.expire(key, 60)
            pipeline.execute()

    def release(self, user_id, connection_id):
        self.redis.zrem(self.prefix + ":connections:" + user_id, connection_id)
