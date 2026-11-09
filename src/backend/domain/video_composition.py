"""What the AI is told to write for a HyperFrames video, and how its answer is turned into one HTML document."""
import re

ASPECTS = {"landscape": (1920, 1080), "vertical": (1080, 1920), "square": (1080, 1080)}

SYSTEM_PROMPT = """You write videos as a single self-contained HTML file for HyperFrames, which renders the HTML to MP4 by \
seeking a paused GSAP timeline frame by frame. Answer with the HTML document only, no explanations and no markdown.

RULES (the render fails or looks wrong if they are broken):
1. The root element has data-composition-id="main", data-start="0", data-duration="<total seconds>", \
data-width and data-height with the canvas size you are given, and a fixed pixel size in CSS (overflow: hidden).
2. Every element that appears or disappears over time has class="clip", data-start and data-duration in seconds \
(it is visible during [start, start + duration)) and data-track-index (an integer). Keep every clip inside the video length.
3. Load GSAP with exactly: <script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
4. Build ONE paused timeline and register it AFTER all tweens: \
const tl = gsap.timeline({ paused: true }); ... window.__timelines = window.__timelines || {}; window.__timelines["main"] = tl;
5. Everything visible must be a function of the timeline time: no Date.now(), no Math.random(), no setTimeout/setInterval, \
no fetch/network calls, no repeat: -1, no video/audio playback calls.
6. Do not tween display or visibility on a .clip (animate opacity, x, y, scale, or a child instead). Do not use a CSS \
transform on an element that GSAP also animates (use GSAP x/y/scale/rotation instead).
7. Fonts: only use Inter, Montserrat, Poppins, Roboto, Open Sans, Lato, Outfit, Nunito, Oswald, Playfair Display. \
Set font-family explicitly.
8. No external images, videos or audio unless the user gave a URL; draw with HTML/CSS (gradients, shapes, big text, icons made of \
CSS or inline SVG). Keep text large and readable, inside a safe margin of 5% of the canvas.
9. Design like a good sales or marketing video: one idea per scene, strong contrast, large type (headline 90px+ on 1920 wide), \
a consistent palette, clear call to action in the last scene, smooth eases (power2.out, power3.inOut, back.out).
10. Write in the language of the user's request.

MINIMAL EXAMPLE (3 seconds):
<!doctype html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;background:#0b1020}
#root{position:relative;width:1920px;height:1080px;overflow:hidden;background:linear-gradient(135deg,#0b1020,#1b2a6b);font-family:Inter,sans-serif;color:#fff}
#title{position:absolute;left:160px;top:420px;font-size:120px;font-weight:700}
</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="3" data-width="1920" data-height="1080">
  <h1 id="title" class="clip" data-start="0" data-duration="3" data-track-index="0">Oferta especial</h1>
</div>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
<script>
const tl = gsap.timeline({ paused: true });
tl.from("#title", { opacity: 0, y: 60, duration: 0.8, ease: "power2.out" }, 0.2);
window.__timelines = window.__timelines || {};
window.__timelines["main"] = tl;
</script></body></html>"""

_FENCE = re.compile(r"```(?:html)?\s*(.*?)```", re.S | re.I)
_DOCUMENT = re.compile(r"<!doctype html.*</html>", re.S | re.I)


def request_message(prompt: str, *, aspect: str, seconds: int) -> str:
    width, height = ASPECTS[aspect]
    return (f"Canvas: {width}x{height} (data-width={width}, data-height={height}). "
            f"Video length: {seconds} seconds (data-duration={seconds} on the root).\n\n"
            f"Video requested by the user:\n{prompt}")


def fix_message(problems: list[str]) -> str:
    return ("The render check found these problems in your HTML. Fix all of them and answer the complete HTML "
            "document again, nothing else:\n" + "\n".join(f"- {problem}" for problem in problems))


def extract_html(answer: str) -> str:
    """The HTML document inside the AI's answer, dropping markdown fences and any text around it."""
    fenced = _FENCE.search(answer)
    text = fenced.group(1) if fenced else answer
    document = _DOCUMENT.search(text)
    if document:
        return document.group(0).strip()
    return text.strip()
