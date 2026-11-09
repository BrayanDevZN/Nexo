import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const PERF_KEY = "nexo:perf";
const REDUCE_KEY = "nexo:reduce-motion";

// Animations play unless the visitor chooses otherwise with the footer button. The operating
// system's "reduce motion" setting is deliberately not used: many weak PCs have it switched on
// by their power/performance profile and the site then looked static.
function savedReduce() {
  try {
    return localStorage.getItem(REDUCE_KEY) === "true";
  } catch {
    return false;
  }
}
function applyReduce(reduce: boolean) {
  document.documentElement.dataset.reduceMotion = reduce ? "true" : "false";
}
const PROBE_FRAMES = 40;
const SKIP_FRAMES = 15;

function storedLite() {
  try {
    return sessionStorage.getItem(PERF_KEY) === "lite";
  } catch {
    return false;
  }
}
function weakHardware() {
  const info = navigator as Navigator & { deviceMemory?: number };
  return (info.hardwareConcurrency ?? 8) <= 2 || (info.deviceMemory ?? 8) <= 2;
}
function applyPerf(lite: boolean) {
  document.documentElement.dataset.perf = lite ? "lite" : "full";
  try {
    sessionStorage.setItem(PERF_KEY, lite ? "lite" : "full");
  } catch {
    /* sem armazenamento: a medição roda de novo na próxima visita */
  }
}

/**
 * Measures how smoothly this device draws frames. On a slow one the page switches to a "lite"
 * rendering: every animation and element stays, only the costliest effects get cheaper (see
 * `html[data-perf="lite"]` in globals.css). A device never goes back to full during a visit.
 */
function useDevicePerformance() {
  useEffect(() => {
    let lite = storedLite() || weakHardware();
    document.documentElement.dataset.perf = lite ? "lite" : "full";
    let cancelled = false;
    const timers: number[] = [];
    let frame = 0;
    let runs = 0;
    const probe = () => {
      const deltas: number[] = [];
      let last = 0;
      const step = (now: number) => {
        if (cancelled) return;
        if (last && !document.hidden) deltas.push(now - last);
        last = now;
        if (deltas.length < SKIP_FRAMES + PROBE_FRAMES) {
          frame = window.requestAnimationFrame(step);
          return;
        }
        const sorted = deltas.slice(SKIP_FRAMES).sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        const slowest = sorted[Math.floor(sorted.length * 0.9)];
        const slow = median > 22 || slowest > 45 || weakHardware();
        runs += 1;
        // The first run decides (it may undo a stored "lite"); the later run can only make it lighter.
        if (runs === 1 || slow) {
          if (slow !== lite) applyPerf(slow);
          lite = slow;
        }
      };
      frame = window.requestAnimationFrame(step);
    };
    // Measure once the page has settled, and again later in case loading disturbed the first run.
    const start = () => {
      timers.push(window.setTimeout(probe, 1200), window.setTimeout(probe, 9000));
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      window.cancelAnimationFrame(frame);
      window.removeEventListener("load", start);
    };
  }, []);
}

const MotionContext = createContext({
  paused: false,
  reduced: false,
  pageVisible: true,
  toggle: () => {},
  setReduced: (_value: boolean) => {},
});

export function MotionProvider({ children }: { children: ReactNode }) {
  const [paused, setPaused] = useState(false);
  const [reduced, setReducedState] = useState(() => {
    const saved = savedReduce();
    applyReduce(saved);
    return saved;
  });
  const setReduced = (value: boolean) => {
    setReducedState(value);
    applyReduce(value);
    try {
      if (value) localStorage.setItem(REDUCE_KEY, "true");
      else localStorage.removeItem(REDUCE_KEY);
    } catch {
      /* sem armazenamento: vale só até recarregar a página */
    }
  };
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  useDevicePerformance();
  useEffect(() => {
    const visibility = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  return (
    <MotionContext.Provider
      value={{
        paused,
        reduced,
        pageVisible,
        toggle: () => setPaused((value) => !value),
        setReduced,
      }}
    >
      {children}
    </MotionContext.Provider>
  );
}

export function useMotionActivity<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  const motion = useContext(MotionContext);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.05 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return {
    ref,
    ...motion,
    active: visible && motion.pageVisible && !motion.paused && !motion.reduced,
  };
}

export function useMotionPreferences() {
  return useContext(MotionContext);
}
