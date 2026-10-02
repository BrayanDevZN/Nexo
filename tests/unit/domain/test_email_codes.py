from backend.domain.email_codes import EmailCodeService


def test_recovery_digest_binds_code_email_and_secret():
    codes = EmailCodeService("test-code-key-" * 4)
    digest = codes.digest("ANA@example.com", "12345678")
    assert digest == codes.digest("ana@example.com", "12345678")
    assert digest != codes.digest("other@example.com", "12345678")
    assert digest != codes.digest("ana@example.com", "12345679")
    assert digest != EmailCodeService("other-key-" * 4).digest("ana@example.com", "12345678")
    assert "12345678" not in digest
