import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { useMotionPreferences } from "@/components/MotionProvider";

export type LoginNHandle = { dissolve: () => Promise<void> };

/** The Nexo N on the sign-in screen. Three.js loads on demand; without WebGL the screen is simply without it. */
export const LoginN = forwardRef<LoginNHandle>(function LoginN(_props, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<{ dissolve: () => Promise<void>; dispose: () => void } | null>(null);
  const { reduced } = useMotionPreferences();
  useImperativeHandle(ref, () => ({ dissolve: () => scene.current?.dissolve() ?? Promise.resolve() }), []);
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    let cancelled = false;
    import("@/components/rp/world")
      .then(({ createLoginN }) => {
        if (cancelled) return;
        try {
          scene.current = createLoginN(node, { lite: document.documentElement.dataset.perf === "lite", reduced });
          node.dataset.ready = "true";
        } catch {
          node.dataset.ready = "failed";
        }
      })
      .catch(() => { node.dataset.ready = "failed"; });
    return () => {
      cancelled = true;
      scene.current?.dispose();
      scene.current = null;
    };
  }, [reduced]);
  return <canvas ref={canvas} className="admin-login-n" aria-hidden="true" />;
});
