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
        '.section-heading, .solution-card, [data-slot="carousel-item"], .value-card, .value-validation, .value-cta, .about-grid > div, .faq-grid > div:first-child, [data-slot="accordion-item"], .contact-panel, .streaming-copy, .stream-console, .nx-reveal, .nx-row, .nx-stage, .nx-faq-row, .nx-cta-foot, .nx-footer-top, .nx-footer-legal, .nx-wordmark, .nx-principles > *',
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
          // Like AOS `once`: each piece appears one time, then stays.
          if (!entry.isIntersecting) return;
          (entry.target as HTMLElement).dataset.reveal = "visible";
          observer.unobserve(entry.target);
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
      if (node.matches('.solution-card, [data-slot="accordion-item"], .nx-stage, .nx-footer-top, .nx-footer-legal')) {
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
