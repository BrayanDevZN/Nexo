from contextlib import contextmanager

from backend.repository.cache.queries import CachedRepositories


class CachedRepositoryManager:
    def __init__(self, repositories, cache):
        self.repositories, self.cache = repositories, cache

    @contextmanager
    def transaction(self):
        with self.repositories.transaction() as repositories:
            yield CachedRepositories(repositories, self.cache, repositories.users.session)

    @contextmanager
    def read_transaction(self):
        with self.repositories.read_transaction() as repositories:
            yield CachedRepositories(repositories, self.cache, repositories.users.session)
