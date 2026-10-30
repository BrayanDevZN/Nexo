import { NEXO_LEFT, NEXO_RIGHT } from "@/components/rp/nexoShape";

type Particle = { sx: number; sy: number; tx: number; ty: number; ox: number; oy: number; size: number; color: string; delay: number; spin: number };

const COLORS = ["#6d28d9", "#8b5cf6", "#a78bfa", "#4c1d95", "#c4b5fd", "#2a1450"];
const FORM = 560; // ms for the particles to gather into the N
const HOLD = 140; // ms the N stays formed, while the page changes underneath
const SCATTER = 620; // ms for it to break apart again

function inside(polygon: [number, number][], x: number, y: number) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * Covers the screen with a veil of dust that gathers into the Nexo N, calls `swap` while the N is formed (so the page
 * changes out of sight), then lets the N scatter and the veil clear. With reduced motion `swap` runs at once.
 */
export function playAreaTransition(swap: () => void) {
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

  // Where the N sits: centred, about half the shorter side tall.
  const unit = (Math.min(width, height) * 0.5) / 3.8;
  const count = lite ? 300 : width < 700 ? 420 : 620;
  const pieces = [NEXO_LEFT, NEXO_RIGHT];
  const particles: Particle[] = [];
  while (particles.length < count) {
    const polygon = pieces[particles.length % 2];
    const x = -1.6 + Math.random() * 3.2;
    const y = -1.95 + Math.random() * 3.9;
    if (!inside(polygon, x, y)) continue;
    const edge = Math.random() * Math.PI * 2;
    const far = Math.max(width, height);
    const angle = Math.atan2(y, x) + (Math.random() - 0.5) * 2;
    particles.push({
      sx: width / 2 + Math.cos(edge) * far * (0.55 + Math.random() * 0.5),
      sy: height / 2 + Math.sin(edge) * far * (0.55 + Math.random() * 0.5),
      tx: width / 2 + x * unit,
      ty: height / 2 - y * unit,
      ox: Math.cos(angle) * (180 + Math.random() * 520),
      oy: Math.sin(angle) * (180 + Math.random() * 520) - 120,
      size: 2 + Math.random() * 4.5,
      color: COLORS[particles.length % COLORS.length],
      delay: Math.random() * 0.35,
      spin: (Math.random() - 0.5) * 6,
    });
  }

  const ease = (k: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
  const back = dark ? "12, 7, 22" : "243, 236, 255";
  const start = performance.now();
  let swapped = false;
  const finish = () => {
    if (!swapped) swap();
    canvas.remove();
  };
  const draw = (now: number) => {
    const elapsed = now - start;
    const total = FORM + HOLD + SCATTER;
    if (elapsed >= total) return finish();
    requestAnimationFrame(draw);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const forming = Math.min(1, elapsed / FORM);
    const leaving = Math.max(0, (elapsed - FORM - HOLD) / SCATTER);
    context.fillStyle = `rgba(${back}, ${leaving > 0 ? 0.97 * (1 - ease(leaving * 1.1)) : 0.97 * ease(forming * 1.2)})`;
    context.fillRect(0, 0, width, height);
    if (!swapped && elapsed >= FORM) {
      swapped = true;
      swap();
    }
    for (const p of particles) {
      let x: number;
      let y: number;
      let alpha = 1;
      let size = p.size;
      if (leaving <= 0) {
        const k = ease((forming - p.delay) / (1 - p.delay));
        x = p.sx + (p.tx - p.sx) * k;
        y = p.sy + (p.ty - p.sy) * k;
        alpha = 0.25 + 0.75 * k;
      } else {
        const k = ease((leaving - p.delay * 0.3) / (1 - p.delay * 0.3));
        x = p.tx + p.ox * k;
        y = p.ty + p.oy * k;
        alpha = 1 - k;
        size = p.size * (1 - 0.6 * k);
      }
      context.globalAlpha = Math.max(0, alpha);
      context.fillStyle = p.color;
      const turn = leaving > 0 ? p.spin * leaving : 0;
      context.save();
      context.translate(x, y);
      context.rotate(turn);
      context.fillRect(-size / 2, -size / 2, size, size);
      context.restore();
    }
    context.globalAlpha = 1;
  };
  requestAnimationFrame(draw);
  // If frames stop (a hidden tab), the page must still change.
  window.setTimeout(() => { if (!swapped) { swapped = true; swap(); } }, FORM + 500);
}
