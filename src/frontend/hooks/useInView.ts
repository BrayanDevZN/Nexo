import { useEffect, useRef, useState } from "react";

/** True while the element is in view. With `repeat` false it stays true once seen. */
export function useInView<T extends HTMLElement>(margin = "0px 0px -15% 0px", repeat = false) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || (seen && !repeat)) return;
    if (!("IntersectionObserver" in window)) return setSeen(true);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (repeat) return setSeen(entry.isIntersecting);
        if (!entry.isIntersecting) return;
        setSeen(true);
        observer.disconnect();
      },
      { rootMargin: margin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [seen, margin, repeat]);
  return [ref, seen] as const;
}
