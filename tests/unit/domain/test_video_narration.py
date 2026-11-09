from backend.domain.video_narration import (
    MARGIN_SECONDS,
    narration_lines,
    narration_prompt,
    too_long,
    with_audio,
)

DOCUMENT = ('<!doctype html><html><body><div data-composition-id="main" data-start="0" data-duration="12">'
            '<div class="clip" data-start="0" data-duration="4" data-narration="Sua &quot;pizzaria&quot; lotada."></div>'
            '<div class="clip" data-start="4.5" data-duration="4" data-narration="  Criamos o conteúdo.  "></div>'
            '<div class="clip" data-start="8" data-duration="4" data-narration=""></div>'
            '<div class="clip" data-start="9" data-narration="sem duração"></div></div></body></html>')


def test_the_spoken_lines_come_from_the_scenes_in_order_unescaped_and_trimmed():
    lines = narration_lines(DOCUMENT)
    assert [(line.text, line.start, line.duration) for line in lines] == [
        ('Sua "pizzaria" lotada.', 0, 4), ("Criamos o conteúdo.", 4.5, 4)]


def test_a_line_must_end_before_its_scene_does():
    lines = narration_lines(DOCUMENT)
    assert too_long(lines, [1.0, 2.0]) == []
    problems = too_long(lines, [4 - MARGIN_SECONDS + 0.01, 1.0])
    assert len(problems) == 1 and "starts at 0s" in problems[0] and "shorten" in problems[0]


def test_the_audio_clips_are_placed_at_the_start_of_each_scene_inside_the_root():
    lines = narration_lines(DOCUMENT)
    document, names = with_audio(DOCUMENT, lines)
    assert names == ["narration-1.wav", "narration-2.wav"]
    assert document.index("<audio") > document.index("data-composition-id")
    assert document.index("<audio") < document.index('class="clip"')
    assert '<audio id="narration-2" data-start="4.5" data-duration="4"' in document
    assert 'src="assets/narration-2.wav"' in document
    assert with_audio("<div>sem raiz</div>", lines) == ("<div>sem raiz</div>", [])
    assert with_audio(DOCUMENT, []) == (DOCUMENT, [])


def test_the_narration_rules_are_given_to_the_ai():
    prompt = narration_prompt()
    assert "data-narration" in prompt and "2.3 words per second" in prompt and "Do NOT write any <audio>" in prompt
