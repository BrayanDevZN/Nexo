import pytest

from backend.infra.connections.photos import PhotoStorage


def test_storage_generates_names_and_handles_only_own_files(tmp_path):
    storage = PhotoStorage(tmp_path / "photos")
    name = storage.write(b"normalized-image")
    assert name.endswith(".jpg") and len(name) == 36
    assert storage.read(name) == b"normalized-image"
    assert (storage.root / name).stat().st_mode & 0o777 == 0o600
    with pytest.raises(FileNotFoundError):
        storage.read("../../secret.env")
    storage.delete(name)
    assert not (storage.root / name).exists()


def test_symlink_does_not_expose_outside_file(tmp_path):
    storage = PhotoStorage(tmp_path / "photos")
    storage.root.mkdir()
    secret = tmp_path / "private"
    secret.write_bytes(b"private")
    name = "a" * 32 + ".jpg"
    (storage.root / name).symlink_to(secret)
    with pytest.raises(FileNotFoundError):
        storage.read(name)
