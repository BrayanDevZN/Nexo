import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

const MotionContext = createContext({
  paused: false,
  reduced: false,
  pageVisible: true,
  toggle: () => {},
});

export function MotionProvider({ children }: { children: ReactNode }) {
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const preference = () => setReduced(media.matches);
    const visibility = () => setPageVisible(!document.hidden);
    media.addEventListener("change", preference);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      media.removeEventListener("change", preference);
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

export function MotionControl() {
  const { paused, reduced, toggle } = useContext(MotionContext);
  const Icon = paused ? Play : Pause;
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      disabled={reduced}
      aria-label={
        reduced
          ? "Movimento reduzido ativado no dispositivo"
          : paused
            ? "Retomar animações"
            : "Pausar animações"
      }
    >
      <Icon data-icon="inline-start" />
      {reduced
        ? "Movimento reduzido"
        : paused
          ? "Retomar animações"
          : "Pausar animações"}
    </Button>
  );
}

export function useMotionPreferences() {
  return useContext(MotionContext);
}
