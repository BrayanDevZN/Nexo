"""Rules of the scheduling product (/atendimentos): roles inside a business, permissions, statuses and hours."""
import re
import unicodedata
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo
from typing import Literal

BUSINESS_OWNER = "owner"
BUSINESS_MANAGER = "manager"
BUSINESS_STAFF = "staff"
BUSINESS_VIEWER = "viewer"
BUSINESS_ROLES: tuple[str, ...] = (BUSINESS_OWNER, BUSINESS_MANAGER, BUSINESS_STAFF, BUSINESS_VIEWER)
# Roles an invitation can grant: the owner is the person who created the business, never invited.
INVITABLE_ROLES: tuple[str, ...] = (BUSINESS_MANAGER, BUSINESS_STAFF, BUSINESS_VIEWER)
BusinessRole = Literal["owner", "manager", "staff", "viewer"]
InvitableRole = Literal["manager", "staff", "viewer"]

# What each role may do inside one business. Reading is implied for every member.
PERMISSIONS: dict[str, frozenset[str]] = {
    "business.write": frozenset({BUSINESS_OWNER, BUSINESS_MANAGER}),
    "business.delete": frozenset({BUSINESS_OWNER}),
    "members.manage": frozenset({BUSINESS_OWNER, BUSINESS_MANAGER}),
    "services.write": frozenset({BUSINESS_OWNER, BUSINESS_MANAGER}),
    "appointments.write": frozenset({BUSINESS_OWNER, BUSINESS_MANAGER, BUSINESS_STAFF}),
    "appointments.delete": frozenset({BUSINESS_OWNER, BUSINESS_MANAGER}),
}
# A member can only grant or change roles strictly below their own.
_RANK = {BUSINESS_OWNER: 3, BUSINESS_MANAGER: 2, BUSINESS_STAFF: 1, BUSINESS_VIEWER: 0}


def allowed(role: str, permission: str) -> bool:
    return role in PERMISSIONS[permission]


def outranks(role: str, other: str) -> bool:
    return _RANK.get(role, -1) > _RANK.get(other, -1)


def business_name_key(name: str) -> str:
    """What makes two business names the same: no case, accents, spaces or punctuation ("Zé  Barbearia" == "ze barbearia")."""
    plain = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", plain.lower())


def clean_cnpj(value: str | None) -> str | None:
    """Digits of a CNPJ, validated with its two check digits; blank means no CNPJ (it is optional)."""
    if value is None or not value.strip():
        return None
    digits = re.sub(r"\D", "", value)
    if len(digits) != 14 or len(set(digits)) == 1:
        raise ValueError("CNPJ inválido")
    for size in (12, 13):
        weights = ([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] if size == 12 else [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
        total = sum(int(d) * w for d, w in zip(digits[:size], weights, strict=True))
        check = 11 - total % 11
        if int(digits[size]) != (0 if check >= 10 else check):
            raise ValueError("CNPJ inválido")
    return digits


APPOINTMENT_STATUSES: tuple[str, ...] = ("scheduled", "confirmed", "done", "cancelled", "no_show")
AppointmentStatus = Literal["scheduled", "confirmed", "done", "cancelled", "no_show"]
# Statuses that still occupy the agenda; the others free their slot.
ACTIVE_STATUSES = frozenset({"scheduled", "confirmed"})

WEEKDAYS: tuple[str, ...] = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
_TIME = re.compile(r"^([01][0-9]|2[0-3]):[0-5][0-9]$")
MAX_INTERVALS_PER_DAY = 4


def validate_opening_hours(value) -> dict[str, list[list[str]]]:
    """Normalize {"mon": [["09:00", "18:00"]], ...}: every weekday present, intervals ordered and not overlapping."""
    if value is None:
        return {day: [] for day in WEEKDAYS}
    if not isinstance(value, dict) or set(value) - set(WEEKDAYS):
        raise ValueError("Opening hours must map weekdays mon..sun to lists of [start, end] times")
    result: dict[str, list[list[str]]] = {}
    for day in WEEKDAYS:
        intervals = value.get(day) or []
        if not isinstance(intervals, list) or len(intervals) > MAX_INTERVALS_PER_DAY:
            raise ValueError(f"Opening hours of {day} must be a list of at most {MAX_INTERVALS_PER_DAY} intervals")
        cleaned = []
        for interval in intervals:
            if (not isinstance(interval, (list, tuple)) or len(interval) != 2
                    or not all(isinstance(item, str) and _TIME.match(item) for item in interval)):
                raise ValueError(f"Each interval of {day} must be [\"HH:MM\", \"HH:MM\"]")
            start, end = interval
            if start >= end:
                raise ValueError(f"Interval of {day} must end after it starts")
            cleaned.append([start, end])
        cleaned.sort()
        for previous, current in zip(cleaned, cleaned[1:]):
            if current[0] < previous[1]:
                raise ValueError(f"Intervals of {day} overlap")
        result[day] = cleaned
    return result


def to_utc(value: datetime) -> datetime:
    """Store naive UTC like every other timestamp of the database; naive input is taken as UTC already."""
    if value.tzinfo is None:
        return value.replace(microsecond=0)
    return value.astimezone(UTC).replace(tzinfo=None, microsecond=0)


PERIODS: tuple[str, ...] = ("today", "tomorrow", "day", "week", "month", "next_7_days", "next_30_days", "upcoming")
Period = Literal["today", "tomorrow", "day", "week", "month", "next_7_days", "next_30_days", "upcoming"]
ANCHORED_PERIODS = frozenset({"day", "week", "month"})


def period_range(period: str, *, anchor: date | None = None, timezone: str = "America/Sao_Paulo",
                 week_starts: str = "sunday", now: datetime | None = None) -> tuple[datetime, datetime | None]:
    """The [from, until) of a calendar period, as the business sees it, in the naive UTC the database stores.

    day/week/month look at `anchor` (default: today), exactly like the day, week and month views of the agenda;
    the week starts on Sunday or Monday. "upcoming" has no end.
    """
    if period not in PERIODS:
        raise ValueError("Unknown period")
    zone = ZoneInfo(timezone)
    moment = (now or datetime.now(UTC)).astimezone(zone)
    today = moment.date()
    base = anchor or today

    def utc(day: date) -> datetime:
        return datetime.combine(day, time.min, zone).astimezone(UTC).replace(tzinfo=None)

    if period == "upcoming":
        return moment.astimezone(UTC).replace(tzinfo=None, second=0, microsecond=0), None
    if period == "today":
        start, end = today, today + timedelta(days=1)
    elif period == "tomorrow":
        start, end = today + timedelta(days=1), today + timedelta(days=2)
    elif period == "day":
        start, end = base, base + timedelta(days=1)
    elif period == "week":
        start = base - timedelta(days=(base.weekday() + 1) % 7 if week_starts == "sunday" else base.weekday())
        end = start + timedelta(days=7)
    elif period == "month":
        start = base.replace(day=1)
        end = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
    elif period == "next_7_days":
        start, end = today, today + timedelta(days=7)
    else:
        start, end = today, today + timedelta(days=30)
    return utc(start), utc(end)


def slugify(name: str) -> str:
    """Address of the business for its future public page: ascii letters, digits and dashes."""
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")
    return slug[:60].strip("-") or "negocio"
