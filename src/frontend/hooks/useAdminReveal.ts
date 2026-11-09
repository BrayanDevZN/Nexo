import { useEffect, useRef } from "react";
import { useMotionPreferences } from "@/components/MotionProvider";

// Page headings and top-level cards; cards nested in other cards stay still so entrances never stack.
const TARGETS = '.admin-section-head, [data-slot="card"]';
const STAGGER_MS = 70;
const MAX_DELAY_MS = 350;

/**
 * Same entrance as the public site (fade and rise as content scrolls into view), for the panel.
 * The panel renders its content after fetching, so new nodes are picked up with a MutationObserver.
 * `scope` changes whenever the page changes.
 */
export function useAdminReveal(enabled: boolean, scope: string) {
  const ref = useRef<HTMLElement>(null);
  const { paused, reduced } = useMotionPreferences();
  useEffect(() => {
    const root = ref.current;
    if (!root || !enabled || !("IntersectionObserver" in window)) return;
    const seen = new WeakSet<HTMLElement>();
    const reveal = (node: HTMLElement, state: "visible" | "pending") => { node.dataset.reveal = state; };
    const observer = paused || reduced ? null : new IntersectionObserver(entries => {
      const entering = entries.filter(entry => entry.isIntersecting);
      entries.forEach(entry => {
        const node = entry.target as HTMLElement;
        if (entry.isIntersecting) {
          // Several blocks entering together cascade from the top, like the streaming demo on the site.
          const order = entering.indexOf(entry);
          node.style.setProperty("--reveal-delay", `${Math.min(order * STAGGER_MS, MAX_DELAY_MS)}ms`);
          reveal(node, "visible");
        } else {
          // Leaving the viewport arms the next entrance in either direction.
          reveal(node, "pending");
        }
      });
    }, { threshold: 0, rootMargin: "0px" });
    const scan = () => {
      root.querySelectorAll<HTMLElement>(TARGETS).forEach(node => {
        if (seen.has(node) || node.parentElement?.closest('[data-slot="card"]')) return;
        seen.add(node);
        if (!observer) { reveal(node, "visible"); return; }
        reveal(node, "pending");
        observer.observe(node);
      });
    };
    let frame = 0;
    const mutations = new MutationObserver(() => {
      if (!frame) frame = window.requestAnimationFrame(() => { frame = 0; scan(); });
    });
    scan();
    mutations.observe(root, { childList: true, subtree: true });
    return () => {
      mutations.disconnect();
      observer?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      root.querySelectorAll<HTMLElement>("[data-reveal]").forEach(node => { delete node.dataset.reveal; node.style.removeProperty("--reveal-delay"); });
    };
  }, [enabled, scope, paused, reduced]);
  return ref;
}
