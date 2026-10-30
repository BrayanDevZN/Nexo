import { Fragment, useEffect, useRef } from "react";
import { ArrowUpRight, MessageCircle } from "lucide-react";
import { contactUrl } from "@/lib/content";
import { journey, stations as homeStations, type Station } from "@/lib/journey";
import { smoothScrollTo } from "@/lib/siteEffects";

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const pad = (value: number) => String(value).padStart(2, "0");

/**
 * The scroll corridor. The page is as tall as the stations; a sticky stage shows the text of the one
 * the camera is at while the 3D scene (Scene.tsx) travels to it. Station text stays in the DOM.
 */
export function Journey({
  play,
  stations = homeStations,
  actions,
  label = "Nexo",
}: {
  play: boolean;
  stations?: readonly Station[];
  /** What goes under a station's text. The home page's own links are used when this is left out. */
  actions?: (index: number) => React.ReactNode;
  label?: string;
}) {
  const root = useRef<HTMLElement>(null);
  const items = useRef<(HTMLElement | null)[]>([]);
  const counter = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const hint = useRef<HTMLParagraphElement>(null);
  const dots = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    let frame = 0;
    let onScreen = true;
    // The corridor is sized in svh, which on a phone is shorter than innerHeight while the address bar is
    // showing. Everything below measures in that same unit, or the last station would arrive half gone.
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;left:0;top:0;width:0;height:100svh;visibility:hidden;pointer-events:none";
    document.body.appendChild(probe);
    const unit = () => probe.offsetHeight || window.innerHeight;
    const backdrop = document.querySelector<HTMLElement>(".rp-bg");
    const draw = () => {
      const rect = node.getBoundingClientRect();
      const s = clamp(-rect.top / unit(), 0, stations.length - 1);
      journey.station = s;
      journey.exit = clamp((1 - rect.bottom / unit()) * 1.5, 0, 1);
      backdrop?.style.setProperty("--p", (s / (stations.length - 1)).toFixed(4));
      journey.active = onScreen && !document.hidden;
      items.current.forEach((item, index) => {
        if (!item) return;
        const distance = Math.abs(index - s);
        const o = clamp(1 - distance * 2.4);
        item.style.opacity = String(o);
        item.style.transform = `translate3d(0, ${(index - s) * 60}px, 0)`;
        item.style.visibility = o < 0.02 ? "hidden" : "visible";
        item.style.pointerEvents = o > 0.6 ? "auto" : "none";
        item.dataset.active = o > 0.6 ? "true" : "false";
      });
      dots.current?.querySelectorAll("a").forEach((dot, index) => {
        dot.dataset.active = String(Math.round(s) === index);
      });
      if (counter.current) counter.current.textContent = `${pad(Math.round(s) + 1)} / ${pad(stations.length)}`;
      if (bar.current) bar.current.style.transform = `scaleY(${s / (stations.length - 1)})`;
      if (hint.current) hint.current.style.opacity = String(clamp(1 - s * 3));
      frame = requestAnimationFrame(draw);
    };
    const observer = new IntersectionObserver(([entry]) => (onScreen = entry.isIntersecting), { rootMargin: "100px" });
    observer.observe(node);
    const pointer = (event: PointerEvent) => {
      journey.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      journey.pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
      backdrop?.style.setProperty("--mx", `${event.clientX}px`);
      backdrop?.style.setProperty("--my", `${event.clientY}px`);
    };
    window.addEventListener("pointermove", pointer, { passive: true });

    // One wheel gesture (or arrow / page key) moves exactly one station, like turning a page.
    const last = stations.length - 1;
    let lockedAt = 0;
    let lastInput = 0;
    const current = () => -node.getBoundingClientRect().top / unit();
    const step = (direction: 1 | -1) => {
      const s = current();
      const rect = node.getBoundingClientRect();
      if (rect.top > 2 || s > last + 0.05) return false; // above or below the corridor: normal scrolling
      if (direction > 0 && s >= last - 0.02) return false; // after the last station the page continues
      if (direction < 0 && s <= 0.02) return false;
      const target = direction > 0 ? Math.min(last, Math.floor(s + 0.02) + 1) : Math.max(0, Math.ceil(s - 0.02) - 1);
      smoothScrollTo(window.scrollY + rect.top + target * unit());
      return true;
    };
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaY) < 4 || (event.target as Element | null)?.closest?.('[role="dialog"]')) return;
      const now = performance.now();
      const direction = event.deltaY > 0 ? 1 : -1;
      const locked = now - lockedAt < 600 || now - lastInput < 90;
      lastInput = now;
      const rect = node.getBoundingClientRect();
      const s = -rect.top / unit();
      const inside = rect.top <= 2 && s <= last + 0.05 && !(direction > 0 && s >= last - 0.02) && !(direction < 0 && s <= 0.02);
      if (!inside) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (locked) return;
      if (step(direction)) lockedAt = now;
    };
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('input, textarea, select, [contenteditable], [role="dialog"], button, a')) return;
      const down = ["ArrowDown", "PageDown", " "].includes(event.key) && !event.shiftKey;
      const up = ["ArrowUp", "PageUp"].includes(event.key) || (event.key === " " && event.shiftKey);
      if (!down && !up) return;
      const now = performance.now();
      if (now - lockedAt < 600) return event.preventDefault();
      if (step(down ? 1 : -1)) {
        event.preventDefault();
        lockedAt = now;
      }
    };
    // Touch: one swipe moves one station too, so a phone always rests on a whole station.
    let touchY = 0;
    let touchX = 0;
    let swipe: 1 | -1 | 0 = 0;
    const insideFor = (direction: 1 | -1) => {
      const rect = node.getBoundingClientRect();
      const s = -rect.top / unit();
      return rect.top <= 2 && s <= last + 0.05 && !(direction > 0 && s >= last - 0.02) && !(direction < 0 && s <= 0.02);
    };
    const onTouchStart = (event: TouchEvent) => {
      touchY = event.touches[0].clientY;
      touchX = event.touches[0].clientX;
      swipe = 0;
    };
    const onTouchMove = (event: TouchEvent) => {
      if ((event.target as Element | null)?.closest?.('[role="dialog"]')) return;
      const dy = touchY - event.touches[0].clientY;
      const dx = touchX - event.touches[0].clientX;
      if (!swipe) {
        if (Math.abs(dy) < 8 || Math.abs(dx) > Math.abs(dy)) return;
        const direction = dy > 0 ? 1 : -1;
        if (!insideFor(direction)) return;
        swipe = direction;
      }
      if (event.cancelable) event.preventDefault();
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (!swipe) return;
      const dy = touchY - event.changedTouches[0].clientY;
      const direction = swipe;
      swipe = 0;
      const now = performance.now();
      if (Math.abs(dy) < 40 || now - lockedAt < 450) return;
      const s = current();
      const rect = node.getBoundingClientRect();
      const target = direction > 0 ? Math.min(last, Math.floor(s + 0.02) + 1) : Math.max(0, Math.ceil(s - 0.02) - 1);
      window.scrollTo({ top: window.scrollY + rect.top + target * unit(), behavior: "smooth" });
      lockedAt = now;
    };
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    // `document` runs before the smooth-scroll listener on `window`, so a step is never also eased as a wheel scroll.
    document.addEventListener("wheel", onWheel, { passive: false });
    document.addEventListener("keydown", onKey);
    frame = requestAnimationFrame(draw);
    return () => {
      probe.remove();
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", pointer);
      document.removeEventListener("wheel", onWheel);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [stations]);

  const home = (index: number) => {
    const last = index === stations.length - 1;
    return index === 0 ? (
                <div className="rp-actions">
                  <a className="rp-link rp-whats" href={contactUrl} target="_blank" rel="noopener noreferrer">
                    <MessageCircle aria-hidden="true" /> Falar no WhatsApp
                  </a>
                  <a className="rp-link" href="#solucoes">
                    Ver como podemos ajudar <ArrowUpRight aria-hidden="true" />
                  </a>
                </div>
              ) : index >= 1 && index <= 4 ? (
                <a className="rp-link" href={contactUrl} target="_blank" rel="noopener noreferrer">
                  Saiba mais <ArrowUpRight aria-hidden="true" />
                </a>
              ) : last ? (
                <a className="rp-link" href={contactUrl} target="_blank" rel="noopener noreferrer">
                  Vamos conversar <ArrowUpRight aria-hidden="true" />
                </a>
              ) : null;
  };

  return (
    <section ref={root} className="rp-journey" data-play={play} style={{ height: `${stations.length * 100}svh` }} aria-label={label}>
      {stations.map((station, index) => (
        <span key={`anchor-${station.id}`} id={`estacao-${index}`} className="rp-anchor" style={{ top: `${index * 100}svh` }}>
          {station.anchor ? <span id={station.anchor} /> : null}
        </span>
      ))}
      <span id="inicio" className="rp-anchor" style={{ top: 0 }} />
      <div className="rp-stage">
        {stations.map((station, index) => {
          const Heading = index === 0 ? "h1" : "h2";
          return (
            <article
              key={station.id}
              ref={(element) => {
                items.current[index] = element;
              }}
              className={`rp-station is-${station.side}`}
              aria-labelledby={`titulo-${station.id}`}
            >
              <p className="rp-kicker">{station.kicker}</p>
              <Heading id={`titulo-${station.id}`} className={index === 0 ? `rp-title rp-title-xl${station.title.length > 36 ? " rp-title-long" : ""}` : "rp-title"}>
                <span className="sr-only">{station.title}</span>
                <span aria-hidden="true">
                  {station.title.split(" ").map((word, w) => (
                    <Fragment key={w}>
                      <span className="rp-word">
                        <span className="rp-word-in" style={{ "--i": w } as React.CSSProperties}>
                          {word}
                        </span>
                      </span>{" "}
                    </Fragment>
                  ))}
                </span>
              </Heading>
              <p className="rp-text">{station.text}</p>
              {station.points ? (
                <ul className="rp-points">
                  {station.points.map((point, p) => (
                    <li key={point} style={{ "--p": p } as React.CSSProperties}>
                      {point}
                    </li>
                  ))}
                </ul>
              ) : null}
              {station.note ? <p className="rp-note">{station.note}</p> : null}
              {station.tags ? <p className="rp-tags">{station.tags}</p> : null}
              {actions ? actions(index) : home(index)}
            </article>
          );
        })}
        <p ref={hint} className="rp-scroll-hint">
          Role para explorar
        </p>
        <nav ref={dots} className="rp-dots" aria-label="Estações">
          {stations.map((station, index) => (
            <a key={station.id} href={`#estacao-${index}`} aria-label={station.title} />
          ))}
        </nav>
        <div className="rp-progress" aria-hidden="true">
          <span className="rp-progress-track">
            <span ref={bar} className="rp-progress-bar" />
          </span>
          <span ref={counter} className="rp-counter">
            01 / {pad(stations.length)}
          </span>
        </div>
      </div>
    </section>
  );
}
