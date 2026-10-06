from backend.service.access import ResourceNotFound, authorize, authorize_read


class ClientService:
    def __init__(self, repositories, cached_repositories):
        self.repositories, self.cached_repositories = repositories, cached_repositories

    @staticmethod
    def with_creator(repos, row):
        return ClientService.with_creators(repos, [row])[0]

    @staticmethod
    def with_creators(repos, rows):
        """Add creator names with one indexed query for the whole page."""
        names = repos.db.users.names_by_ids(row["created_by_id"] for row in rows)
        return [{**row, "created_by_name": names.get(row["created_by_id"], "Membro removido")}
                for row in rows]

    def list(self, actor, **filters):
        with self.cached_repositories.read_transaction() as repos:
            authorize_read(repos.db, actor, approved=True)
            return self.with_creators(repos, repos.clients.list(**filters))

    def get(self, actor, identifier):
        with self.cached_repositories.read_transaction() as repos:
            authorize_read(repos.db, actor, approved=True)
            client = repos.clients.get(identifier)
            if client is None:
                raise ResourceNotFound("Client not found")
            return self.with_creator(repos, client)

    def create(self, actor, **fields):
        with self.repositories.transaction() as repos:
            authorize(repos, actor, approved=True)
            row = repos.clients.create(created_by_id=actor.id, **fields)
            row.created_by_name = repos.users.get(actor.id).name
            return row

    def update(self, actor, identifier, **changes):
        with self.repositories.transaction() as repos:
            authorize(repos, actor, approved=True)
            client = repos.clients.get(identifier)
            if client is None:
                raise ResourceNotFound("Client not found")
            row = repos.clients.update(client, **changes)
            row.created_by_name = repos.users.get(row.created_by_id).name
            return row

    def delete(self, actor, identifier):
        with self.repositories.transaction() as repos:
            authorize(repos, actor, approved=True)
            if not repos.clients.delete(identifier):
                raise ResourceNotFound("Client not found")
