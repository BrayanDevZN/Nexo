import pytest

from backend.domain.google import GoogleIdentityError, GoogleTokenVerifier


def test_google_signature_and_verified_identity(google_signer):
    sign, keys = google_signer
    identity = GoogleTokenVerifier("test-google-client").verify(sign(), keys, "test-nonce")
    assert identity.subject == "google-user-123"
    assert identity.email == "ana@example.com"


@pytest.mark.parametrize("changes", [
    {"aud": "attacker-client"}, {"iss": "https://attacker.example"},
    {"email_verified": False}, {"email_verified": "true"}, {"nonce": "wrong"},
    {"exp": 1}, {"sub": ""}, {"email": "invalid"}, {"azp": "other-client"},
    {"aud": ["test-google-client", "other-client"]},
])
def test_google_rejects_invalid_claims(google_signer, changes):
    sign, keys = google_signer
    with pytest.raises(GoogleIdentityError):
        GoogleTokenVerifier("test-google-client").verify(sign(**changes), keys, "test-nonce")


def test_google_rejects_unknown_key_and_tampered_signature(google_signer):
    sign, keys = google_signer
    verifier = GoogleTokenVerifier("test-google-client")
    with pytest.raises(GoogleIdentityError):
        verifier.verify(sign(), {"keys": []}, "test-nonce")
    parts = sign().split(".")
    parts[2] = ("a" if parts[2][0] != "a" else "b") + parts[2][1:]
    with pytest.raises(GoogleIdentityError):
        verifier.verify(".".join(parts), keys, "test-nonce")
