const COLORS = ["#6d28d9", "#8b5cf6", "#a78bfa", "#c4b5fd"];
const OPEN = 560; // ms for the veil to grow from the centre and cover the screen
const HOLD = 560; // ms the area's name stays on screen, while the page changes underneath
const CLOSE = 560; // ms for a round window to open in the veil and show the new page

const ease = (k: number) => {
  const x = Math.min(1, Math.max(0, k));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
const out = (k: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);

type Spark = { angle: number; speed: number; size: number; color: string; offset: number };

/**
 * A round veil grows from the centre of the screen with a bright ring at its edge, the name of the area is written in the
 * middle inside the three rings of the logo, the page changes underneath, and a round window opens to show it.
 * `swap` runs while the screen is covered. With reduced motion it runs at once.
 */
export function playAreaTransition(label: string, swap: () => void) {
  const root = document.documentElement;
  if (root.dataset.reduceMotion === "true" || document.querySelector(".admin-transition")) {
    swap();
    return;
  }
  const lite = root.dataset.perf === "lite";
  const dark = root.classList.contains("dark");
  const canvas = document.createElement("canvas");
  canvas.className = "admin-transition";
  canvas.setAttribute("aria-hidden", "true");
  const context = canvas.getContext("2d");
  if (!context) {
    swap();
    return;
  }
  const ratio = Math.min(window.devicePixelRatio || 1, lite ? 1 : 1.5);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  document.body.appendChild(canvas);

  const cx = width / 2;
  const cy = height / 2;
  const reach = Math.hypot(cx, cy) + 40;
  const sparks: Spark[] = Array.from({ length: lite ? 70 : width < 700 ? 110 : 190 }, (_, i) => ({
    angle: Math.random() * Math.PI * 2,
    speed: 0.6 + Math.random() * 0.9,
    size: 1.5 + Math.random() * 3.5,
    color: COLORS[i % COLORS.length],
    offset: Math.random() * 40,
  }));
  const ink = dark ? "#f1ebfb" : "#21122f";
  const back = dark ? "#0c0716" : "#f3ecff";
  const accent = dark ? "#a78bfa" : "#6d28d9";
  const scale = Math.min(width, height) / 520;
  const font = Math.max(30, Math.min(88, width * 0.11));
  const start = performance.now();
  let swapped = false;
  const finish = () => {
    if (!swapped) swap();
    canvas.remove();
  };

  const ring = (x: number, y: number, radius: number, progress: number, alpha: number) => {
    context.globalAlpha = alpha;
    context.beginPath();
    context.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    context.stroke();
  };

  const draw = (now: number) => {
    const elapsed = now - start;
    const total = OPEN + HOLD + CLOSE;
    if (elapsed >= total) return finish();
    requestAnimationFrame(draw);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const opening = Math.min(1, elapsed / OPEN);
    const closing = Math.max(0, (elapsed - OPEN - HOLD) / CLOSE);
    const grow = reach * ease(opening);
    const hole = reach * ease(closing);

    // The veil: a disc growing from the centre, then the whole screen with a round window that opens.
    context.fillStyle = back;
    context.beginPath();
    if (closing <= 0) {
      context.arc(cx, cy, grow, 0, Math.PI * 2);
    } else {
      context.rect(0, 0, width, height);
      context.arc(cx, cy, hole, 0, Math.PI * 2);
    }
    context.fill("evenodd");
    if (!swapped && elapsed >= OPEN) {
      swapped = true;
      swap();
    }

    // A bright ring on the moving edge, with sparks thrown off it.
    const edge = closing > 0 ? hole : grow;
    const edgeAlpha = closing > 0 ? 1 - closing : opening < 1 ? 1 : 0;
    if (edge > 2 && edgeAlpha > 0) {
      context.lineWidth = 3 * scale + 1;
      context.strokeStyle = accent;
      context.shadowColor = accent;
      context.shadowBlur = 24;
      ring(cx, cy, edge, 1, edgeAlpha);
      context.shadowBlur = 0;
      const travel = closing > 0 ? closing : opening;
      for (const s of sparks) {
        const r = edge + (closing > 0 ? -1 : 1) * s.offset * travel * s.speed;
        context.globalAlpha = edgeAlpha * (1 - travel * 0.7);
        context.fillStyle = s.color;
        context.fillRect(cx + Math.cos(s.angle) * r - s.size / 2, cy + Math.sin(s.angle) * r - s.size / 2, s.size, s.size);
      }
    }

    // In the middle: the three rings of the logo drawing themselves, and the area's name.
    const show = Math.min(1, Math.max(0, (elapsed - OPEN * 0.55) / 380)) * (1 - Math.min(1, Math.max(0, (elapsed - OPEN - HOLD) / 220)));
    if (show > 0) {
      const draw1 = out((elapsed - OPEN * 0.55) / 620);
      context.lineWidth = 1.4;
      context.strokeStyle = ink;
      [[-62, 0], [0, 0], [62, 0]].forEach(([dx], set) => {
        [52, 43, 34].forEach((radius, index) => {
          context.strokeStyle = (set * 3 + index) % 3 === 0 ? accent : ink;
          ring(cx + dx * scale, cy - 72 * scale - font * 0.4, radius * scale, Math.min(1, draw1 * (1.25 - set * 0.1 - index * 0.05)), show * 0.9);
        });
      });
      context.globalAlpha = show;
      context.fillStyle = ink;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = `600 ${font}px "Barlow Semi Condensed", "Arial Narrow", sans-serif`;
      const text = label.toUpperCase().split("").join(String.fromCharCode(8202));
      const lift = (1 - out((elapsed - OPEN * 0.6) / 520)) * 24;
      context.fillText(text, cx, cy + 40 * scale + lift);
    }
    context.globalAlpha = 1;
  };
  requestAnimationFrame(draw);
  // If frames stop (a hidden tab), the page must still change.
  window.setTimeout(() => { if (!swapped) { swapped = true; swap(); } }, OPEN + 500);
}
