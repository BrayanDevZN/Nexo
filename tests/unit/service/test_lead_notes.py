from backend.service.clients import _lead_links, _lead_notes


def test_an_instagram_link_in_the_website_field_goes_to_instagram():
    lead = {"title": "Padaria", "website": "https://www.instagram.com/padaria", "category": "Padaria"}
    assert _lead_links(lead) == {"instagram": "https://www.instagram.com/padaria", "website": None}
    assert "instagram" not in _lead_notes(lead).lower()


def test_a_regular_website_goes_to_website():
    lead = {"title": "Padaria", "website": "padaria.com.br"}
    assert _lead_links(lead) == {"instagram": None, "website": "https://padaria.com.br"}
    assert "padaria.com.br" not in _lead_notes(lead)
    assert _lead_links({"title": "Sem site"}) == {"instagram": None, "website": None}


def test_a_site_that_only_mentions_instagram_is_still_a_site():
    assert _lead_links({"title": "X", "website": "https://notinstagram.com.br"})["website"] == "https://notinstagram.com.br"
    assert _lead_links({"title": "X", "website": "https://x.com/instagram.com"})["website"] == "https://x.com/instagram.com"
