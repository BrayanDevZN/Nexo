import re
from pathlib import Path
from uuid import uuid4


class PhotoStorage:
    def __init__(self, root: Path):
        self.root = root.resolve()

    def _path(self, name):
        if not isinstance(name, str) or not re.fullmatch(r"[a-f0-9]{32}\.jpg", name):
            raise FileNotFoundError("Profile photo not found")
        path = self.root / name
        if path.is_symlink():
            raise FileNotFoundError("Profile photo not found")
        return path

    def write(self, data):
        self.root.mkdir(parents=True, exist_ok=True)
        name = uuid4().hex + ".jpg"
        path = self._path(name)
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
        return name

    def read(self, name):
        return self._path(name).read_bytes()

    def delete(self, name):
        self._path(name).unlink(missing_ok=True)
