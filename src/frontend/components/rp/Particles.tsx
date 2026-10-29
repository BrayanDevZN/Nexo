import { useEffect, useRef } from "react";
import { useMotionPreferences } from "@/components/MotionProvider";

type Dot = { hx: number; hy: number; x: number; y: number; vx: number; vy: number; size: number; alpha: number; depth: number; phase: number; tint: number; lane: number; col: number; row: number };

const TINTS = ["109, 40, 217", "139, 92, 246", "76, 29, 149", "167, 139, 250"];

/**
 * How the dust behaves depends on the section being read:
 * - drift: slow dust (the 3D journey)
 * - order: scattered dots snapping into a neat grid (less rework, fewer mistakes)
 * - rise: bubbles floating up (the questions)
 * - network: dots joined by lines (the contact: a connection)
 */
type Mode = "drift" | "order" | "rise" | "network";
const SECTIONS: [string, Mode][] = [
  ["valor", "order"],
  ["duvidas", "rise"],
  ["contato", "network"],
];

/**
 * Small particles over the whole page. When the visitor scrolls they are thrown about in proportion to the
 * speed and then settle back; in each section of the page they take the shape that fits its topic.
 */
export function Particles() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { reduced, paused } = useMotionPreferences();
  useEffect(() => {
    const node = canvas.current;
    const context = node?.getContext("2d");
    if (!node || !context) return;
    const lite = document.documentElement.dataset.perf === "lite";
    let width = 0;
    let height = 0;
    let ratio = 1;
    let dots: Dot[] = [];
    let frame = 0;
    let stir = 0; // how shaken the dust is right now
    let lastY = window.scrollY;
    let lastTime = performance.now();
    let mode: Mode = "drift";

    const layout = () => {
      // Grid for "order": as many columns as fit a comfortable spacing.
      const cols = Math.max(4, Math.round(Math.sqrt((dots.length * width) / height)));
      const rows = Math.ceil(dots.length / cols);
      dots.forEach((dot, index) => {
        dot.col = index % cols;
        dot.row = Math.floor(index / cols);
        dot.lane = (index % 5) / 4;
        dot.hx = mode === "order" ? ((dot.col + 0.5) / cols) * width : dot.hx;
        dot.hy = mode === "order" ? ((dot.row + 0.5) / rows) * height : dot.hy;
      });
    };

    const build = () => {
      ratio = Math.min(window.devicePixelRatio || 1, lite ? 1 : 2);
      width = window.innerWidth;
      height = window.innerHeight;
      node.width = Math.round(width * ratio);
      node.height = Math.round(height * ratio);
      node.style.width = `${width}px`;
      node.style.height = `${height}px`;
      const count = Math.round((width < 800 ? 48 : 85) * (lite ? 0.5 : 1));
      dots = Array.from({ length: count }, () => {
        const hx = Math.random() * width;
        const hy = Math.random() * height;
        return {
          hx,
          hy,
          x: hx,
          y: hy,
          vx: 0,
          vy: 0,
          size: 2.2 + Math.random() * 3.6,
          alpha: 0.4 + Math.random() * 0.45,
          depth: 0.4 + Math.random() * 1.2,
          phase: Math.random() * Math.PI * 2,
          tint: Math.floor(Math.random() * TINTS.length),
          lane: 0,
          col: 0,
          row: 0,
        };
      });
      layout();
    };

    const draw = () => {
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      if (mode === "network") {
        const reach = width < 800 ? 120 : 170;
        context.lineWidth = 1;
        for (let i = 0; i < dots.length; i++) {
          for (let j = i + 1; j < dots.length; j++) {
            const dx = dots[i].x - dots[j].x;
            const dy = dots[i].y - dots[j].y;
            const distance = Math.hypot(dx, dy);
            if (distance > reach) continue;
            context.strokeStyle = `rgba(109, 40, 217, ${(1 - distance / reach) * 0.35})`;
            context.beginPath();
            context.moveTo(dots[i].x, dots[i].y);
            context.lineTo(dots[j].x, dots[j].y);
            context.stroke();
          }
        }
      }
      for (const dot of dots) {
        const color = TINTS[dot.tint];
        if (mode === "order") {
          context.fillStyle = `rgba(${color}, ${dot.alpha})`;
          const side = dot.size * 1.6;
          context.fillRect(dot.x - side / 2, dot.y - side / 2, side, side);
        } else if (mode === "rise") {
          // A bubble: a ring with a small highlight.
          const radius = dot.size * 1.8;
          context.strokeStyle = `rgba(${color}, ${dot.alpha})`;
          context.lineWidth = 1.4;
          context.beginPath();
          context.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
          context.stroke();
          context.fillStyle = `rgba(255, 255, 255, ${dot.alpha * 0.8})`;
          context.beginPath();
          context.arc(dot.x - radius * 0.35, dot.y - radius * 0.35, radius * 0.22, 0, Math.PI * 2);
          context.fill();
        } else {
          context.fillStyle = `rgba(${color}, ${dot.alpha})`;
          context.beginPath();
          context.arc(dot.x, dot.y, dot.size, 0, Math.PI * 2);
          context.fill();
        }
      }
    };

    // Which topic is in the middle of the screen right now.
    const pick = () => {
      const middle = window.innerHeight / 2;
      let next: Mode = "drift";
      for (const [id, kind] of SECTIONS) {
        const rect = document.getElementById(id)?.getBoundingClientRect();
        if (rect && rect.top <= middle && rect.bottom >= middle) next = kind;
      }
      // The footer follows the contact section.
      const footer = document.querySelector(".nx-footer")?.getBoundingClientRect();
      if (footer && footer.top <= middle) next = "network";
      if (next === mode) return;
      mode = next;
      layout();
      // A little shake so the change of shape reads as the dust rearranging itself.
      stir = Math.min(stir + 0.9, 2.4);
      if (mode === "rise" || mode === "network" || mode === "drift") dots.forEach((dot) => ((dot.hx = Math.random() * width), (dot.hy = Math.random() * height)));
    };

    build();
    draw();
    if (reduced || paused) return;
    pick();

    const onScroll = () => {
      const raw = window.scrollY - lastY;
      lastY = window.scrollY;
      const delta = Math.max(-260, Math.min(260, raw));
      stir = Math.min(stir + Math.abs(delta) * 0.004, 2.4);
      for (const dot of dots) {
        // Everything is pushed against the scroll, nearer dust more than far dust, plus a random kick.
        dot.vy -= delta * 0.03 * dot.depth * (0.4 + Math.random());
        dot.vx += (Math.random() - 0.5) * Math.abs(delta) * 0.07 * dot.depth;
      }
      pick();
    };

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min((now - lastTime) / 16.67, 3);
      lastTime = now;
      stir *= Math.pow(0.96, dt);
      const t = now / 1000;
      for (const dot of dots) {
        let tx = dot.hx;
        let ty = dot.hy;
        let pull = 0.006 / (1 + stir * 2);
        if (mode === "drift" || mode === "network") {
          tx += Math.sin(t * 0.3 + dot.phase) * 14;
          ty += Math.cos(t * 0.25 + dot.phase * 1.3) * 14;
        } else if (mode === "order") {
          pull = 0.012 / (1 + stir);
        } else if (mode === "rise") {
          dot.y -= (0.25 + dot.depth * 0.45) * dt;
          if (dot.y < -20) {
            dot.y = height + 20;
            dot.x = Math.random() * width;
          }
          tx = dot.x + Math.sin(t * 0.7 + dot.phase) * 0.6;
          ty = dot.y;
          pull = 0.01;
        }
        // A spring back to its place, weaker while shaken, so the dust scatters and then settles.
        dot.vx += (tx - dot.x) * pull * dt + (Math.random() - 0.5) * stir * 0.35 * dot.depth;
        dot.vy += (ty - dot.y) * pull * dt + (Math.random() - 0.5) * stir * 0.35 * dot.depth;
        const damping = Math.pow(0.93, dt);
        dot.vx *= damping;
        dot.vy *= damping;
        dot.x += dot.vx * dt;
        dot.y += dot.vy * dt;
      }
      draw();
    };
    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden) {
        lastTime = performance.now();
        frame = requestAnimationFrame(loop);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", build);
    document.addEventListener("visibilitychange", onVisibility);
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", build);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduced, paused]);
  return <canvas ref={canvas} className="rp-particles" aria-hidden="true" />;
}
