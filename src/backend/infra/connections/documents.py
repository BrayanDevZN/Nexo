import re
from pathlib import Path
from uuid import uuid4


class DocumentStorage:
    def __init__(self, root: Path):
        self.root = root.resolve()

    def path(self, key):
        if not re.fullmatch(r"[a-f0-9]{32}\.bin", key):
            raise FileNotFoundError("Document not found")
        path = self.root / key
        if path.is_symlink():
            raise FileNotFoundError("Document not found")
        return path

    def write(self, data):
        self.root.mkdir(parents=True, exist_ok=True)
        key = uuid4().hex + ".bin"
        path = self.path(key)
        created = False
        try:
            with path.open("xb") as stream:
                created = True
                path.chmod(0o600)
                stream.write(data)
        except BaseException:
            if created:
                path.unlink(missing_ok=True)
            raise
        return key

    def read(self, key):
        return self.path(key).read_bytes()

    def delete(self, key):
        self.path(key).unlink(missing_ok=True)
