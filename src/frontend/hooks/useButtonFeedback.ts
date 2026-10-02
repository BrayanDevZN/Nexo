import { useEffect } from "react";

/** Explicit pointer feedback also covers touch browsers with transient :active. */
export function useButtonFeedback() {
  useEffect(() => {
    let pressed: HTMLElement | null = null;
    let releaseTimer: number | undefined;
    const clear = () => {
      window.clearTimeout(releaseTimer);
      pressed?.removeAttribute("data-pressed");
      pressed = null;
    };
    const press = (event: PointerEvent) => {
      if (event.button !== 0) return;
      clear();
      const button =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('button, [data-slot="button"]')
          : null;
      if (!button || button.matches(':disabled, [aria-disabled="true"]'))
        return;
      pressed = button;
      button.dataset.pressed = "true";
    };
    const release = () => {
      releaseTimer = window.setTimeout(clear, 160);
    };
    document.addEventListener("pointerdown", press, true);
    document.addEventListener("pointerup", release, true);
    document.addEventListener("pointercancel", clear, true);
    window.addEventListener("blur", clear);
    return () => {
      clear();
      document.removeEventListener("pointerdown", press, true);
      document.removeEventListener("pointerup", release, true);
      document.removeEventListener("pointercancel", clear, true);
      window.removeEventListener("blur", clear);
    };
  }, []);
}
