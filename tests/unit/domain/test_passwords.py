import pytest

from backend.domain.passwords import PasswordHasher, PasswordPolicyError


def test_salted_hash_and_verification():
    hasher = PasswordHasher(rounds=4)
    password = "senha-correta-123"
    first, second = hasher.hash(password), hasher.hash(password)
    assert first != second and password not in first
    assert hasher.verify(password, first)
    assert not hasher.verify("senha-incorreta", first)
    assert not hasher.verify(password, None)
    assert not hasher.verify(password, "invalid-hash")


@pytest.mark.parametrize("password", ["", "short", "a" * 73, "á" * 37])
def test_policy_rejects_short_or_oversized_passwords(password):
    with pytest.raises(PasswordPolicyError):
        PasswordHasher(rounds=4).hash(password)


def test_utf8_limit_never_truncates():
    hasher = PasswordHasher(rounds=4)
    password = "á" * 36
    hashed = hasher.hash(password)
    assert hasher.verify(password, hashed)
    assert not hasher.verify(password + "x", hashed)
