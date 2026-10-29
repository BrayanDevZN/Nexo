import { useEffect, useRef } from "react";
import { useMotionPreferences } from "@/components/MotionProvider";

export function useScrollReveal() {
  const ref = useRef<HTMLElement>(null);
  const { paused, reduced } = useMotionPreferences();
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root || !("IntersectionObserver" in window)) return;
    const nodes = Array.from(
      root.querySelectorAll<HTMLElement>(
        '.section-heading, .solution-card, [data-slot="carousel-item"], .value-card, .value-validation, .value-cta, .about-grid > div, .faq-grid > div:first-child, [data-slot="accordion-item"], .contact-panel, .streaming-copy, .stream-console, .nx-reveal, .nx-row, .nx-stage, .nx-faq-row, .nx-cta-foot, .nx-footer-top, .nx-footer-legal, .nx-wordmark, .nx-principles > *, .stream-explainer li, .nx-benefit, .nx-validation li, .nx-faq-row > *, .nx-value-cta, .nx-process-head > *',
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
          // Streams in every time it comes into view, going down or coming back up.
          (entry.target as HTMLElement).dataset.reveal = entry.isIntersecting ? "visible" : "pending";
        });
      },
      { threshold: 0, rootMargin: "0px 0px -12% 0px" },
    );
    nodes.forEach((node) => {
      const rect = node.getBoundingClientRect();
      node.dataset.reveal =
        rect.bottom > 0 && rect.top < window.innerHeight
          ? "visible"
          : "pending";
      const siblings = Array.from(node.parentElement?.children ?? []);
      node.style.setProperty("--reveal-delay", `${Math.min(siblings.indexOf(node), 5) * 110}ms`);
      observer.observe(node);
    });
    return () => observer.disconnect();
  }, [paused, reduced]);
  return ref;
}
