import hashlib
import json

ISSUE = """
if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
redis.call('SET', KEYS[2], '1', 'EX', ARGV[3])
redis.call('DEL', KEYS[1])
redis.call('HSET', KEYS[1], 'digest', ARGV[1], 'record', ARGV[2], 'attempts', '0')
redis.call('EXPIRE', KEYS[1], ARGV[4])
return 1
"""
CONSUME = """
local digest = redis.call('HGET', KEYS[1], 'digest')
if not digest then return false end
if digest ~= ARGV[1] then
  local attempts = redis.call('HINCRBY', KEYS[1], 'attempts', 1)
  if attempts >= tonumber(ARGV[2]) then redis.call('DEL', KEYS[1]) end
  return false
end
local record = redis.call('HGET', KEYS[1], 'record')
redis.call('DEL', KEYS[1])
return record
"""
REMOVE = """
if redis.call('HGET', KEYS[1], 'digest') == ARGV[1] then
  return redis.call('DEL', KEYS[1], KEYS[2])
end
return 0
"""


class EmailCodeRepository:
    def __init__(self, redis, namespace, *, ttl, max_attempts, cooldown):
        self.redis, self.namespace = redis, namespace
        self.ttl, self.max_attempts, self.cooldown = ttl, max_attempts, cooldown

    def key(self, email):
        return self.namespace + ":" + hashlib.sha256(email.strip().lower().encode()).hexdigest()

    def issue(self, email, digest, record):
        key = self.key(email)
        return bool(self.redis.eval(ISSUE, 2, key, key + ":cooldown", digest,
                                    json.dumps(record), self.cooldown, self.ttl))

    def consume(self, email, digest):
        record = self.redis.eval(CONSUME, 1, self.key(email), digest, self.max_attempts)
        return json.loads(record) if record else None

    def remove(self, email, digest):
        key = self.key(email)
        self.redis.eval(REMOVE, 2, key, key + ":cooldown", digest)
