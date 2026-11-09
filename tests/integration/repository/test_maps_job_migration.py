from sqlalchemy import create_engine, text

from backend.repository.db.schema import create_tables


def test_old_maps_jobs_gain_the_widening_columns_and_keep_their_rows(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'maps.db'}")
    with engine.begin() as connection:
        connection.exec_driver_sql("""CREATE TABLE maps_jobs (
            id VARCHAR(36) PRIMARY KEY, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
            job_id VARCHAR(36) NOT NULL UNIQUE, created_by_id VARCHAR(36) NOT NULL, name VARCHAR(120) NOT NULL,
            niche VARCHAR(120), notified_at DATETIME)""")
        connection.exec_driver_sql("""INSERT INTO maps_jobs (id, created_at, updated_at, job_id, created_by_id, name)
            VALUES ('1', '2026-10-01', '2026-10-01', 'job-old', 'someone', 'Busca antiga')""")

    create_tables(engine, "owner@example.com")
    create_tables(engine, "owner@example.com")  # repeatable

    with engine.begin() as connection:
        columns = {row[1] for row in connection.exec_driver_sql("PRAGMA table_info('maps_jobs')")}
        assert {"auto_expand", "radius", "start_radius", "params", "expanded_to"} <= columns
        assert connection.execute(text("SELECT name, auto_expand, radius, expanded_to FROM maps_jobs")).one() == ("Busca antiga", 0, None, None)
    engine.dispose()
