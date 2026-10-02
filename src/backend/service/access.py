class AccessDenied(ValueError):
    pass


class ResourceNotFound(ValueError):
    pass


class ResourceConflict(ValueError):
    pass


def authorize(repos, actor, *, approved=False):
    current = repos.users.get(actor.id)
    if (current is None or current.session_version != actor.session_version
            or current.status not in {"pending", "approved"}
            or (approved and current.status != "approved")):
        raise AccessDenied("Access denied")
    return current
