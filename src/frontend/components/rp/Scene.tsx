import { useEffect, useRef } from "react";
import { useMotionPreferences } from "@/components/MotionProvider";
import { stations as homeStations, type Station } from "@/lib/journey";

/** The fixed canvas behind the page. Three.js loads on demand; with no WebGL the page still reads fine without it. */
export function Scene({ stations = homeStations }: { stations?: readonly Pick<Station, "scene" | "side">[] }) {
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
          dispose = createWorld(node, { lite: document.documentElement.dataset.perf === "lite", reduced }, stations);
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
  }, [reduced, stations]);
  return <canvas ref={canvas} className="rp-canvas" aria-hidden="true" />;
}
