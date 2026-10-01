import { useEffect } from "react";

/** Keep section navigation on the same clean URL, including mobile menu links. */
export function useSectionNavigation() {
  useEffect(() => {
    const scrollTo = (id: string) => {
      const section = document.getElementById(id);
      if (!section) return false;
      section.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
      return true;
    };
    const initial = window.location.hash;
    if (initial) {
      history.replaceState(
        history.state,
        "",
        window.location.pathname + window.location.search,
      );
      requestAnimationFrame(() =>
        scrollTo(decodeURIComponent(initial.slice(1))),
      );
    }
    const navigate = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>('a[href^="#"]')
          : null;
      if (!anchor || anchor.target === "_blank") return;
      const id = decodeURIComponent(anchor.getAttribute("href")!.slice(1));
      if (!document.getElementById(id)) return;
      event.preventDefault();
      // Wait for the mobile sheet to release its scroll lock and restore focus.
      if (anchor.closest('[role="dialog"]')) {
        window.setTimeout(() => scrollTo(id), 300);
      } else {
        scrollTo(id);
      }
      if (anchor.classList.contains("skip-link")) {
        const section = document.getElementById(id)!;
        section.setAttribute("tabindex", "-1");
        section.focus({ preventScroll: true });
      }
    };
    document.addEventListener("click", navigate);
    return () => document.removeEventListener("click", navigate);
  }, []);
}
