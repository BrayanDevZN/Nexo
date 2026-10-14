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
