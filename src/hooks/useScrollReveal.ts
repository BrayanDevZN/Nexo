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
        '.section-heading, .solution-card, [data-slot="carousel-item"], .case-panel, .about-grid > div, .faq-grid > div, [data-slot="accordion-item"], .contact-panel, .streaming-copy, .stream-console',
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
          if (!entry.isIntersecting) return;
          (entry.target as HTMLElement).dataset.reveal = "visible";
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.06, rootMargin: "0px 0px -30px 0px" },
    );
    nodes.forEach((node) => {
      if (node.dataset.reveal === "visible") return;
      const rect = node.getBoundingClientRect();
      // Content above the initial viewport and hidden tab panels remain readable.
      if (rect.bottom <= 0 || node.closest('[role="tabpanel"][hidden]')) {
        node.dataset.reveal = "visible";
        return;
      }
      node.dataset.reveal = "pending";
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
