from backend.infra.config.settings import Settings
from backend.infra.connections.database import DatabaseConnection
from backend.repository.db.schema import create_tables


def initialize_tables(settings: Settings) -> None:
    database = DatabaseConnection(settings)
    try:
        create_tables(database.engine)
    finally:
        database.close()
