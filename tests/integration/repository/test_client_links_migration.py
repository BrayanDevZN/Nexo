from sqlalchemy import create_engine, text

from backend.repository.db.schema import create_tables

NOTES = ("Origem: Google Maps\nCategoria no Maps: Padaria\nInstagram: https://www.instagram.com/padaria\n"
         "Site: https://padaria.com.br\nNota: 4.5 (10 avaliações)")


def test_links_in_old_lead_notes_move_to_their_own_fields(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'clients.db'}")
    create_tables(engine, "owner@example.com")
    with engine.begin() as connection:
        for identifier, notes in (("1", NOTES), ("2", "Cliente indicado, sem links"),
                                  ("3", "Site: não informado\nSite: https://primeiro.com.br\nSite: https://segundo.com.br")):
            connection.execute(text(
                "INSERT INTO clients (id, created_at, updated_at, name, niche, contract_closed, pipeline_stage, created_by_id, notes) "
                "VALUES (:id, '2026-10-01', '2026-10-01', :name, 'Varejo', 0, 'lead', 'someone', :notes)"),
                {"id": identifier, "name": "Cliente " + identifier, "notes": notes})

    create_tables(engine, "owner@example.com")
    create_tables(engine, "owner@example.com")  # repeatable

    with engine.begin() as connection:
        rows = connection.execute(text("SELECT id, instagram, website, notes FROM clients ORDER BY id")).all()
    assert rows[0] == ("1", "https://www.instagram.com/padaria", "https://padaria.com.br",
                       "Origem: Google Maps\nCategoria no Maps: Padaria\nNota: 4.5 (10 avaliações)")
    assert rows[1] == ("2", None, None, "Cliente indicado, sem links")
    # What cannot be moved (invalid text, a second site) stays in the notes: nothing is lost.
    assert rows[2] == ("3", None, "https://primeiro.com.br", "Site: não informado\nSite: https://segundo.com.br")
    engine.dispose()
