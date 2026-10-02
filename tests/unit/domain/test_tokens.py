from datetime import UTC, datetime, timedelta

import jwt
import pytest

from backend.domain.tokens import InvalidTokenError, JWTService

SECRET = "unit-jwt-key-" * 4


def test_round_trip_and_unique_jti():
    service = JWTService(SECRET)
    first, second = service.create("user", 3), service.create("user", 3)
    claims = service.read(first)
    assert claims.user_id == "user" and claims.session_version == 3
    assert claims.token_id != service.read(second).token_id


def payload():
    return jwt.decode(JWTService(SECRET).create("user", 0), SECRET,
                      algorithms=["HS256"], audience="nexo-admin")


@pytest.mark.parametrize("changes", [
    {"aud": "other"}, {"iss": "other"}, {"kind": "reset"}, {"ver": -1},
    {"ver": True}, {"ver": "0"}, {"sub": ""}, {"jti": ""},
    {"exp": 1}, {"exp": "9999999999"},
])
def test_invalid_claims_are_rejected(changes):
    claims = payload()
    claims.update(changes)
    token = jwt.encode(claims, SECRET, algorithm="HS256")
    with pytest.raises(InvalidTokenError):
        JWTService(SECRET).read(token)


def test_missing_expiration_unsigned_and_wrong_key_are_rejected():
    claims = payload()
    del claims["exp"]
    variants = [jwt.encode(claims, SECRET, algorithm="HS256"),
                jwt.encode(payload(), "", algorithm="none"),
                JWTService("different-key-" * 4).create("user", 0)]
    for token in variants:
        with pytest.raises(InvalidTokenError):
            JWTService(SECRET).read(token)


def test_expired_and_future_tokens_are_rejected():
    for delta in [-timedelta(hours=1), timedelta(hours=1)]:
        service = JWTService(SECRET, clock=lambda: datetime.now(UTC) + delta)
        with pytest.raises(InvalidTokenError):
            JWTService(SECRET).read(service.create("user", 0))
