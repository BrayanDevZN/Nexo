import hashlib
from uuid import uuid4

import pytest
from redis import Redis

from backend.repository.redis.oauth import OAuthRepository, OAuthStateError


def test_oauth_state_binding_ttl_and_single_use(local_redis_url):
    client = Redis.from_url(local_redis_url, decode_responses=True)
    flows = OAuthRepository(client, "test:oauth:" + uuid4().hex)
    state = flows.save("state", {"browser": hashlib.sha256(b"browser").hexdigest(),
                                 "nonce": "nonce", "verifier": "verifier"}, 300)
    assert 0 < client.ttl(flows._key("state", state)) <= 300
    with pytest.raises(OAuthStateError):
        flows.consume_state(state, "wrong-browser")
    assert flows.consume_state(state, "browser")["nonce"] == "nonce"
    with pytest.raises(OAuthStateError):
        flows.consume_state(state, "browser")
    grant = flows.save("profile", {"email": "ana@example.com"}, 600)
    client.expire(flows._key("profile", grant), 0)
    with pytest.raises(OAuthStateError):
        flows.read("profile", grant)
    client.close()
