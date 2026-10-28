from backend.domain.video_composition import (
    ASPECTS,
    SYSTEM_PROMPT,
    extract_html,
    fix_message,
    request_message,
)

DOCUMENT = '<!doctype html>\n<html><body><div data-composition-id="main"></div></body></html>'


def test_a_fenced_answer_gives_back_only_the_document():
    answer = f"Claro! Aqui está:\n```html\n{DOCUMENT}\n```\nQualquer ajuste me diga."
    assert extract_html(answer) == DOCUMENT


def test_text_around_an_unfenced_document_is_dropped():
    assert extract_html(f"Segue o vídeo:\n{DOCUMENT}\nFim.") == DOCUMENT


def test_an_answer_without_a_document_is_returned_trimmed():
    assert extract_html("  só texto  ") == "só texto"


def test_the_request_states_canvas_and_length():
    message = request_message("Vídeo de oferta", aspect="vertical", seconds=20)
    assert "1080x1920" in message and "data-duration=20" in message and "Vídeo de oferta" in message
    assert set(ASPECTS) == {"landscape", "vertical", "square"}


def test_the_fix_message_lists_every_problem():
    message = fix_message(["a: one", "b: two"])
    assert "- a: one" in message and "- b: two" in message


def test_the_system_prompt_carries_the_render_contract():
    for rule in ('window.__timelines["main"]', "class=\"clip\"", "data-start", "paused: true"):
        assert rule in SYSTEM_PROMPT
