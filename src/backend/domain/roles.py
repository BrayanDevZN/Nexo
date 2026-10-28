"""The permissions of each approved Nexo account."""

OWNER = "owner"
ADMIN = "admin"
DEV = "dev"
COMMERCIAL = "commercial"

ALL_ROLES = frozenset({OWNER, ADMIN, DEV, COMMERCIAL})
TEAM_MANAGERS = frozenset({OWNER})
ADMINISTRATORS = frozenset({OWNER, ADMIN})
DEVELOPERS = frozenset({OWNER, ADMIN, DEV})
SALES = frozenset({OWNER, ADMIN, COMMERCIAL})


def has_role(user, allowed: frozenset[str]) -> bool:
    return user.status == "approved" and user.role in allowed

# Everyone can hold API keys. Developers' keys reach the whole API; a commercial key only reaches the
# clients API, the videos API and the key check the maps server uses, so it works for Maps, clients and videos
# and nothing else.
API_KEY_HOLDERS = ALL_ROLES
COMMERCIAL_KEY_PATHS = ("/clients", "/videos", "/auth/api-keys/validate")


def key_allows(user, path: str) -> bool:
    if user.role in DEVELOPERS:
        return True
    return any(path == allowed or path.startswith(allowed + "/") for allowed in COMMERCIAL_KEY_PATHS)


# Who an announcement is for. Admins and owners are in every audience, so they always receive everything.
AUDIENCES = ("all", "commercial", "dev")


def audience_roles(audience: str) -> frozenset[str]:
    if audience == "commercial":
        return SALES
    if audience == "dev":
        return DEVELOPERS
    if audience == "all":
        return ALL_ROLES
    raise ValueError("Unknown audience")
