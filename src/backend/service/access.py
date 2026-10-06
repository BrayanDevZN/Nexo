class AccessDenied(ValueError):
    pass


class ResourceNotFound(ValueError):
    pass


class ResourceConflict(ValueError):
    pass


REQUEST_AUTHENTICATED = "_nexo_request_authenticated"


def _valid(actor, *, approved=False):
    return (actor is not None and actor.session_version >= 0
            and actor.status in {"pending", "approved"}
            and (not approved or actor.status == "approved"))


def authorize(repos, actor, *, approved=False):
    current = repos.users.get(actor.id)
    if (current is None or current.session_version != actor.session_version
            or not _valid(current, approved=approved)):
        raise AccessDenied("Access denied")
    return current


def authorize_read(repos, actor, *, approved=False):
    """Avoid re-querying a user already validated by this HTTP request.

    Direct service calls and all mutations still use ``authorize``.  The
    marker is attached only by the request dependency after an authoritative
    database validation, so this removes one duplicate SELECT from read paths
    without extending a cached or stale authorization decision across calls.
    """
    if getattr(actor, REQUEST_AUTHENTICATED, False):
        if not _valid(actor, approved=approved):
            raise AccessDenied("Access denied")
        return actor
    return authorize(repos, actor, approved=approved)
