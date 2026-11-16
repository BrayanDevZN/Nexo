"""The cache of one business survives another business's writes, and dies with its own."""
from unittest.mock import Mock

from backend.infra.connections.database import DatabaseConnection
from backend.repository.db.control.manager import RepositoryManager
from backend.repository.db.schema import create_tables


def test_scheduling_writes_invalidate_per_business_and_the_business_list(settings):
    database = DatabaseConnection(settings)
    create_tables(database.engine)
    cache = Mock()
    manager = RepositoryManager(database, cache=cache)
    try:
        with manager.transaction() as repos:
            ana = repos.booking_users.create(name="Ana", email="ana@example.com", password_hash="hash")
            bia = repos.booking_users.create(name="Bia", email="bia@example.com", password_hash="hash")
            first = repos.businesses.create(owner_id=ana.id, name="A", slug="a", opening_hours={})
            second = repos.businesses.create(owner_id=bia.id, name="B", slug="b", opening_hours={})
        cache.invalidate.assert_called_once()
        assert cache.invalidate.call_args.args[0] >= {
            "booking_users", "businesses", "business_members",
            "business_members:" + first.id, "business_members:" + second.id}
        cache.reset_mock()
        with manager.transaction() as repos:
            repos.appointments.create(business_id=first.id, service_id=None, service_name="Corte", staff_user_id=None,
                                      customer_name="João", starts_at=__import__("datetime").datetime(2026, 1, 1, 10),
                                      ends_at=__import__("datetime").datetime(2026, 1, 1, 11), created_by_id=ana.id)
        assert cache.invalidate.call_args.args[0] == {"appointments", "appointments:" + first.id}
        cache.reset_mock()
        with manager.transaction() as repos:
            repos.businesses.add_member(second.id, ana.id, "viewer")
        # Membership changes refresh "my businesses" too, which joins both tables.
        assert cache.invalidate.call_args.args[0] == {"business_members", "business_members:" + second.id, "businesses"}
        cache.reset_mock()
        with manager.transaction() as repos:
            repos.businesses.delete_business(repos.businesses.get(first.id))
        tables = cache.invalidate.call_args.args[0]
        assert "appointments:" + first.id in tables and "businesses" in tables
        assert "appointments:" + second.id not in tables
        with manager.read_transaction() as repos:
            assert repos.appointments.list(first.id) == [] and repos.businesses.members(first.id) == []
            assert [member.user_id for member in repos.businesses.members(second.id)] == [bia.id, ana.id]
    finally:
        database.close()
