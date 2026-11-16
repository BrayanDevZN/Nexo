from datetime import UTC, datetime, timedelta, timezone

import pytest

from backend.domain.scheduling import allowed, outranks, slugify, to_utc, validate_opening_hours


def test_opening_hours_are_normalized_with_every_weekday():
    hours = validate_opening_hours({"mon": [["13:00", "18:00"], ["09:00", "12:00"]]})
    assert hours["mon"] == [["09:00", "12:00"], ["13:00", "18:00"]]
    assert all(hours[day] == [] for day in ("tue", "wed", "thu", "fri", "sat", "sun"))
    assert validate_opening_hours(None)["sun"] == []


@pytest.mark.parametrize("value", [
    {"monday": []}, {"mon": "09:00-18:00"}, {"mon": [["9:00", "18:00"]]}, {"mon": [["18:00", "09:00"]]},
    {"mon": [["09:00", "12:00"], ["11:00", "13:00"]]}, {"mon": [["24:00", "25:00"]]}, {"mon": [["09:00"]]},
    {"mon": [["08:00", "09:00"]] * 5},
])
def test_invalid_opening_hours_are_refused(value):
    with pytest.raises(ValueError):
        validate_opening_hours(value)


def test_permissions_follow_the_role_ladder():
    assert allowed("viewer", "business.write") is False and allowed("staff", "appointments.write") is True
    assert allowed("staff", "appointments.delete") is False and allowed("manager", "members.manage") is True
    assert allowed("manager", "business.delete") is False and allowed("owner", "business.delete") is True
    assert outranks("owner", "manager") and outranks("manager", "staff") and not outranks("staff", "staff")
    assert not outranks("manager", "owner") and outranks("viewer", "unknown") is True


def test_timestamps_are_stored_as_naive_utc():
    local = datetime(2026, 12, 1, 13, 0, 0, 500, tzinfo=timezone(timedelta(hours=-3)))
    assert to_utc(local) == datetime(2026, 12, 1, 16, 0)
    assert to_utc(datetime(2026, 12, 1, 16, 0, 1)) == datetime(2026, 12, 1, 16, 0, 1)
    assert to_utc(datetime(2026, 12, 1, 16, 0, tzinfo=UTC)).tzinfo is None


def test_slugs_are_ascii_and_bounded():
    assert slugify("Barbearia do Zé & Cia.") == "barbearia-do-ze-cia"
    assert slugify("   ") == "negocio"
    assert len(slugify("a" * 200)) == 60
