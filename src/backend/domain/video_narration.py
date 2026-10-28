"""Narration of a video: the spoken lines live in the HTML (data-narration on each scene) and become <audio> clips."""
import re
from dataclasses import dataclass
from html.parser import HTMLParser

MAX_LINES = 20
MAX_LINE_CHARS = 500
# A line must end this long before its scene does, so a voice never runs into the next scene's.
MARGIN_SECONDS = 0.2
_ROOT = re.compile(r"<[^>]*\bdata-composition-id\s*=\s*[\"']main[\"'][^>]*>", re.I)


@dataclass(frozen=True)
class Line:
    text: str
    start: float
    duration: float


class _Collector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.lines: list[Line] = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        text = (values.get("data-narration") or "").strip()
        if not text:
            return
        try:
            start, duration = float(values.get("data-start") or 0), float(values["data-duration"])
        except (KeyError, TypeError, ValueError):
            return
        if duration > 0 and start >= 0:
            self.lines.append(Line(text[:MAX_LINE_CHARS], start, duration))


def narration_lines(document: str) -> list[Line]:
    """The lines to speak, in the order of the document, each with the start and length of its scene."""
    collector = _Collector()
    collector.feed(document)
    collector.close()
    return collector.lines[:MAX_LINES]


def too_long(lines: list[Line], durations: list[float]) -> list[str]:
    """What the AI (or the person) must fix: lines whose speech does not fit in their scene."""
    return [f'The narration of the scene that starts at {line.start:g}s lasts {spoken:.1f}s but the scene lasts only '
            f'{line.duration:g}s; shorten that narration (about 2.3 words per second) or lengthen the scene.'
            for line, spoken in zip(lines, durations) if spoken > line.duration - MARGIN_SECONDS]


def with_audio(document: str, lines: list[Line]) -> tuple[str, list[str]]:
    """The document with one <audio> per line (placed at its scene's start) and the asset names they use."""
    root = _ROOT.search(document)
    if root is None or not lines:
        return document, []
    names = [f"narration-{number}.wav" for number in range(1, len(lines) + 1)]
    clips = "".join(
        f'\n  <audio id="narration-{number}" data-start="{line.start:g}" data-duration="{line.duration:g}" '
        f'data-track-index="{90 + number}" data-volume="1" src="assets/{name}"></audio>'
        for number, (line, name) in enumerate(zip(lines, names), start=1))
    return document[:root.end()] + clips + document[root.end():], names


def narration_prompt() -> str:
    return """

NARRATION (spoken voice-over, generated automatically):
- Every scene element (the top-level elements with class="clip" and data-start / data-duration) carries a \
data-narration="..." attribute with the exact words spoken during that scene, in the language of the user's request \
(Brazilian Portuguese by default), natural and persuasive, with no emojis, no hashtags and no stage directions.
- The speech must fit its scene: about 2.3 words per second of the scene's data-duration, and at least 0.5 s shorter \
than the scene. A 4-second scene takes at most 7 words.
- Write numbers, prices, dates and symbols as words in the narration ("quatrocentos e noventa e sete reais", not "R$ 497"), \
because the voice reads them literally.
- Do NOT write any <audio> element: the voice-over is added for you. Show the key words on screen as text too.
- Attribute values are HTML: escape double quotes as &quot;."""
