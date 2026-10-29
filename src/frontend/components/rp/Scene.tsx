import { useEffect, useRef } from "react";
import { useMotionPreferences } from "@/components/MotionProvider";

/** The fixed canvas behind the page. Three.js loads on demand; with no WebGL the page still reads fine without it. */
export function Scene() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { reduced } = useMotionPreferences();
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    let dispose: (() => void) | undefined;
    let cancelled = false;
    import("./world")
      .then(({ createWorld }) => {
        if (cancelled) return;
        try {
          dispose = createWorld(node, { lite: document.documentElement.dataset.perf === "lite", reduced });
          node.dataset.ready = "true";
        } catch {
          node.dataset.ready = "failed";
        }
      })
      .catch(() => {
        node.dataset.ready = "failed";
      });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [reduced]);
  return <canvas ref={canvas} className="rp-canvas" aria-hidden="true" />;
}
