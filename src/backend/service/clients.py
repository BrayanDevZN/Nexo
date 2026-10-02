from backend.service.access import ResourceNotFound, authorize


class ClientService:
    def __init__(self, repositories, cached_repositories):
        self.repositories, self.cached_repositories = repositories, cached_repositories

    def list(self, actor, **filters):
        with self.cached_repositories.transaction() as repos:
            authorize(repos.db, actor, approved=True)
            return repos.clients.list(**filters)

    def get(self, actor, identifier):
        with self.cached_repositories.transaction() as repos:
            authorize(repos.db, actor, approved=True)
            client = repos.clients.get(identifier)
            if client is None:
                raise ResourceNotFound("Client not found")
            return client

    def create(self, actor, **fields):
        with self.repositories.transaction() as repos:
            authorize(repos, actor, approved=True)
            return repos.clients.create(created_by_id=actor.id, **fields)

    def update(self, actor, identifier, **changes):
        with self.repositories.transaction() as repos:
            authorize(repos, actor, approved=True)
            client = repos.clients.get(identifier)
            if client is None:
                raise ResourceNotFound("Client not found")
            return repos.clients.update(client, **changes)

    def delete(self, actor, identifier):
        with self.repositories.transaction() as repos:
            authorize(repos, actor, approved=True)
            if not repos.clients.delete(identifier):
                raise ResourceNotFound("Client not found")
