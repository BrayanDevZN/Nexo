import { useEffect, useRef } from "react";
import { useMotionPreferences } from "@/components/MotionProvider";

type Dot = { hx: number; hy: number; x: number; y: number; vx: number; vy: number; size: number; alpha: number; depth: number; phase: number; tint: number };

const TINTS = ["109, 40, 217", "139, 92, 246", "76, 29, 149", "167, 139, 250"];

/**
 * Small particles over the whole page. They drift on their own; when the visitor scrolls they are thrown
 * about in proportion to the speed and then settle back, like dust stirred by moving between sections.
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

    const build = () => {
      ratio = Math.min(window.devicePixelRatio || 1, lite ? 1 : 2);
      width = window.innerWidth;
      height = window.innerHeight;
      node.width = Math.round(width * ratio);
      node.height = Math.round(height * ratio);
      node.style.width = `${width}px`;
      node.style.height = `${height}px`;
      const count = Math.round((width < 800 ? 70 : 130) * (lite ? 0.5 : 1));
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
          size: 0.9 + Math.random() * 1.7,
          alpha: 0.3 + Math.random() * 0.5,
          depth: 0.4 + Math.random() * 1.2,
          phase: Math.random() * Math.PI * 2,
          tint: Math.floor(Math.random() * TINTS.length),
        };
      });
    };

    const draw = () => {
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      for (const dot of dots) {
        context.fillStyle = `rgba(${TINTS[dot.tint]}, ${dot.alpha})`;
        context.beginPath();
        context.arc(dot.x, dot.y, dot.size, 0, Math.PI * 2);
        context.fill();
      }
    };

    build();
    draw();
    if (reduced || paused) return;

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
    };

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min((now - lastTime) / 16.67, 3);
      lastTime = now;
      stir *= Math.pow(0.96, dt);
      const t = now / 1000;
      for (const dot of dots) {
        const tx = dot.hx + Math.sin(t * 0.3 + dot.phase) * 14;
        const ty = dot.hy + Math.cos(t * 0.25 + dot.phase * 1.3) * 14;
        // A spring back to its place, weaker while shaken, so the dust scatters and then drifts home.
        const pull = 0.006 / (1 + stir * 2);
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
