import { useEffect, useRef } from "react";
import { useMotionPreferences } from "@/components/MotionProvider";

export function useScrollReveal() {
  const ref = useRef<HTMLElement>(null);
  const { paused, reduced } = useMotionPreferences();
  useEffect(() => {
    const root = ref.current;
    if (!root || !("IntersectionObserver" in window)) return;
    const nodes = Array.from(
      root.querySelectorAll<HTMLElement>(
        '.section-heading, .solution-card, [data-slot="carousel-item"], .case-panel, .about-grid > div, .faq-grid > div:first-child, [data-slot="accordion-item"], .contact-panel, .streaming-copy, .stream-console',
      ),
    );
    if (paused || reduced) {
      nodes.forEach((node) => {
        node.dataset.reveal = "visible";
      });
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // Keep observing: leaving the viewport arms the next entrance in either direction.
          (entry.target as HTMLElement).dataset.reveal = entry.isIntersecting
            ? "visible"
            : "pending";
        });
      },
      { threshold: 0, rootMargin: "0px" },
    );
    nodes.forEach((node) => {
      const rect = node.getBoundingClientRect();
      node.dataset.reveal =
        rect.bottom > 0 && rect.top < window.innerHeight
          ? "visible"
          : "pending";
      if (node.matches('.solution-card, [data-slot="accordion-item"]')) {
        const siblings = Array.from(node.parentElement?.children ?? []);
        node.style.setProperty(
          "--reveal-delay",
          `${(siblings.indexOf(node) % 3) * 65}ms`,
        );
      }
      observer.observe(node);
    });
    return () => observer.disconnect();
  }, [paused, reduced]);
  return ref;
}
