import { useEffect, useRef, useState } from "react";

/**
 * True while the element is "playing": it starts when the element's top edge rises above `on` (a fraction of
 * the viewport height) and stops when the visitor scrolls back up a little (a quarter of a screen) or the
 * element drops below `off`. Scrolling back down then starts it again, so it plays on every visit.
 */
export function useScrollTrigger<T extends HTMLElement>(on: number, off: number) {
  const ref = useRef<T>(null);
  const [active, setActive] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let frame = 0;
    let state = false;
    let peak = 0; // furthest scroll position reached while playing
    let low = window.scrollY; // lowest position since it stopped
    const check = () => {
      frame = 0;
      const height = window.innerHeight;
      const y = window.scrollY;
      const top = node.getBoundingClientRect().top / height;
      if (state) {
        peak = Math.max(peak, y);
        if (top > off || y < peak - height * 0.25) {
          state = false;
          low = y;
          setActive(false);
        }
      } else {
        low = Math.min(low, y);
        if (top < on && y > low + height * 0.1) {
          state = true;
          peak = y;
          setActive(true);
        }
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    // Start playing at once if the page opens already in view.
    const start = () => {
      if (node.getBoundingClientRect().top / window.innerHeight < on) {
        state = true;
        peak = window.scrollY;
        setActive(true);
      }
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    start();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [on, off]);
  return [ref, active] as const;
}
