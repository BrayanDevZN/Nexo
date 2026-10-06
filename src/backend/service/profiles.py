import logging
from uuid import uuid4

from backend.domain.photos import normalize_photo
from backend.service.access import ResourceConflict, ResourceNotFound, authorize

logger = logging.getLogger(__name__)


class ProfileService:
    def __init__(self, repositories, storage, settings):
        self.repositories, self.storage, self.settings = repositories, storage, settings

    def update(self, actor, name, phone):
        with self.repositories.transaction() as repos:
            user = authorize(repos, actor)
            if not repos.users.set_profile_fields(user, name=name, phone=phone):
                raise ResourceConflict("Profile changed; try again")
            return user

    def upload(self, actor, data):
        with self.repositories.transaction() as repos:
            user = authorize(repos, actor)
            previous = user.profile_photo
        normalized = normalize_photo(data, max_bytes=self.settings.profile_photo_max_bytes,
                                     max_pixels=self.settings.profile_photo_max_pixels)
        name = self.storage.write(normalized)
        try:
            with self.repositories.transaction() as repos:
                user = authorize(repos, actor)
                if not repos.users.set_photo_if_current(user, previous=previous, photo=name,
                                                        photo_data=normalized):
                    raise ResourceConflict("Profile photo changed; try again")
        except BaseException:
            self.cleanup_photo(name)
            raise
        self.cleanup_photo(previous)
        return user

    def delete_photo(self, actor):
        with self.repositories.transaction() as repos:
            user = authorize(repos, actor)
            previous = user.profile_photo
            if not repos.users.set_photo_if_current(user, previous=previous, photo=None,
                                                    photo_data=None):
                raise ResourceConflict("Profile photo changed; try again")
        self.cleanup_photo(previous)

    def read_photo(self, actor):
        with self.repositories.transaction() as repos:
            user = authorize(repos, actor)
            name, data = user.profile_photo, user.profile_photo_data
        if data is not None:
            return data
        if name is None:
            raise ResourceNotFound("Profile photo not found")
        try:
            return self.storage.read(name)
        except FileNotFoundError:
            raise ResourceNotFound("Profile photo not found") from None

    def cleanup_photo(self, name):
        if name:
            try:
                self.storage.delete(name)
            except OSError:
                logger.warning("Profile photo cleanup failed")
