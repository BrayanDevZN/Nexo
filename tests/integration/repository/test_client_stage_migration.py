import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError

from backend.repository.db.schema import create_tables

OLD_CLIENTS = """CREATE TABLE clients (
    id VARCHAR(36) PRIMARY KEY, created_at DATETIME, updated_at DATETIME,
    name VARCHAR(160) NOT NULL, niche VARCHAR(120) NOT NULL,
    contract_closed BOOLEAN NOT NULL DEFAULT 0, pipeline_stage VARCHAR(24) DEFAULT 'lead',
    sales_channel VARCHAR(24), created_by_id VARCHAR(36) NOT NULL,
    CONSTRAINT client_pipeline_stage CHECK (pipeline_stage IN ('lead', 'contacted', 'diagnosis', 'proposal', 'negotiation', 'won', 'lost')),
    CONSTRAINT client_sales_channel CHECK (sales_channel IS NULL OR sales_channel IN ('email', 'whatsapp', 'instagram', 'phone', 'in_person', 'other'))
)"""


def test_old_clients_table_accepts_paid_traffic_stages_and_keeps_its_rows(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'clients.db'}")
    with engine.begin() as connection:
        connection.exec_driver_sql(OLD_CLIENTS)
        connection.exec_driver_sql("""INSERT INTO clients (id, name, niche, pipeline_stage, sales_channel, created_by_id)
            VALUES ('old', 'Escritório Antigo', 'Contabilidade', 'proposal', 'whatsapp', 'someone')""")
        with pytest.raises(IntegrityError):
            connection.execute(text("UPDATE clients SET pipeline_stage = 'qualified'"))

    create_tables(engine, "owner@example.com")
    create_tables(engine, "owner@example.com")  # repeatable

    with engine.begin() as connection:
        assert connection.execute(text("SELECT name, pipeline_stage, sales_channel FROM clients")).one() == (
            "Escritório Antigo", "proposal", "whatsapp")
        connection.execute(text("UPDATE clients SET pipeline_stage = 'qualified', sales_channel = 'google_ads'"))
        connection.execute(text("UPDATE clients SET pipeline_stage = 'meeting'"))
        with pytest.raises(IntegrityError):
            connection.execute(text("UPDATE clients SET pipeline_stage = 'nonsense'"))
    engine.dispose()
