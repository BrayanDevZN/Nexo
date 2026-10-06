from concurrent.futures import Future
from unittest.mock import Mock

import pytest
from pydantic import SecretStr

from backend.domain.passwords import PasswordHasher
from backend.service.registration import RegistrationCodeError
from backend.service.runtime import RuntimeServices


def test_redis_registration_expiry_attempt_budget_and_purpose_isolation(
    settings, local_redis_url, monkeypatch
):
    settings.redis_url = SecretStr(local_redis_url)
    settings.email = "owner@example.com"
    settings.password = SecretStr("initial-admin-password")
    monkeypatch.setattr("backend.service.runtime.PasswordHasher", lambda: PasswordHasher(rounds=4))
    runtime = RuntimeServices(settings)
    try:
        runtime.initialize(settings)
        done = Future()
        done.set_result(None)
        runtime.email.send = Mock(return_value=done)
        service = runtime.registration
        service.codes.create = Mock(return_value="12345678")
        service.request(
            name="Ana",
            email="ana@example.com",
            phone="11999999999",
            password="initial-password-123",
        )
        key = service.repository.key("ana@example.com")
        assert 0 < runtime.redis.client.ttl(key) <= settings.email_code_ttl_seconds
        assert service.codes.digest(
            "ana@example.com", "12345678"
        ) != runtime.password_service.codes.digest("ana@example.com", "12345678")
        runtime.redis.client.delete(key)
        with pytest.raises(RegistrationCodeError):
            service.confirm("ana@example.com", "12345678")
        runtime.redis.client.delete(key + ":cooldown")
        service.request(
            name="Ana",
            email="ana@example.com",
            phone="11999999999",
            password="initial-password-123",
        )
        for _ in range(settings.email_code_max_attempts):
            with pytest.raises(RegistrationCodeError):
                service.confirm("ana@example.com", "00000000")
        with pytest.raises(RegistrationCodeError):
            service.confirm("ana@example.com", "12345678")
        with runtime.repositories.transaction() as repos:
            assert repos.users.by_email("ana@example.com") is None
    finally:
        runtime.close()
