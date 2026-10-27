from backend.service.clients import _lead_notes


def test_an_instagram_link_in_the_website_field_is_noted_as_instagram():
    lead = {"title": "Padaria", "website": "https://www.instagram.com/padaria", "category": "Padaria"}
    assert "Instagram: https://www.instagram.com/padaria" in _lead_notes(lead)
    assert "Site:" not in _lead_notes(lead)


def test_a_regular_website_is_noted_as_site():
    notes = _lead_notes({"title": "Padaria", "website": "https://padaria.com.br"})
    assert "Site: https://padaria.com.br" in notes and "Instagram:" not in notes
    assert "Site:" not in _lead_notes({"title": "Sem site"})


def test_a_site_that_only_mentions_instagram_is_still_a_site():
    assert "Site: https://notinstagram.com.br" in _lead_notes({"title": "X", "website": "https://notinstagram.com.br"})
    assert "Site: https://x.com/instagram.com" in _lead_notes({"title": "X", "website": "https://x.com/instagram.com"})
