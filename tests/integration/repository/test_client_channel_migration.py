from sqlalchemy import create_engine, text

from backend.repository.db.schema import create_tables


def test_existing_clients_gain_an_empty_sales_channel_and_keep_their_data(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'clients.db'}")
    with engine.begin() as connection:
        connection.exec_driver_sql("""CREATE TABLE clients (
            id VARCHAR(36) PRIMARY KEY, created_at DATETIME, updated_at DATETIME,
            name VARCHAR(160) NOT NULL, niche VARCHAR(120) NOT NULL,
            contract_closed BOOLEAN NOT NULL DEFAULT 0, created_by_id VARCHAR(36) NOT NULL
        )""")
        connection.exec_driver_sql("""INSERT INTO clients (id, name, niche, created_by_id)
            VALUES ('old', 'Escritório Antigo', 'Contabilidade', 'someone')""")

    create_tables(engine, "owner@example.com")
    create_tables(engine, "owner@example.com")  # repeatable

    with engine.begin() as connection:
        columns = {row[1] for row in connection.exec_driver_sql("PRAGMA table_info('clients')")}
        assert "sales_channel" in columns
        assert connection.execute(text("SELECT name, sales_channel FROM clients WHERE id = 'old'")).one() == (
            "Escritório Antigo", None)
        connection.execute(text("UPDATE clients SET sales_channel = 'email' WHERE id = 'old'"))
        assert connection.execute(text("SELECT sales_channel FROM clients")).scalar_one() == "email"
    engine.dispose()
