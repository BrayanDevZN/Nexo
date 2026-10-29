/**
 * Motion for the public site, adapted from le-lab.io: eased wheel scrolling, a cursor that trails the
 * pointer, magnetic buttons and a curtain that wipes over the page between routes. No dependencies;
 * everything stands down when the visitor turns animations off (`html[data-reduce-motion="true"]`).
 */

// The provider sets the dataset on first render; before that, read the saved choice itself.
const reduced = () => {
  const set = document.documentElement.dataset.reduceMotion;
  if (set) return set === "true";
  try {
    return localStorage.getItem("nexo:reduce-motion") === "true";
  } catch {
    return false;
  }
};
const finePointer = () =>
  window.matchMedia("(hover: hover) and (pointer: fine)").matches;

// ---- smooth scroll -------------------------------------------------------------------------------

const WHEEL_SPEED = 80 / 120; // px of scroll per px of wheel delta (le-lab: 80 per 120-unit notch)
const WHEEL_EASE = 20; // the page covers 1/20 of the remaining distance each 60 Hz frame

let scrollTo: (y: number) => void = (y) => window.scrollTo(0, y);

/** Scrolls to a document position with the same easing as the mouse wheel. */
export function smoothScrollTo(y: number) {
  scrollTo(y);
}

function canScrollInside(start: EventTarget | null) {
  for (let node = start as HTMLElement | null; node && node !== document.body; node = node.parentElement) {
    if (node.getAttribute?.("role") === "dialog") return true;
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return true;
  }
  return false;
}

function startSmoothScroll() {
  const root = document.documentElement;
  const max = () => root.scrollHeight - root.clientHeight;
  let pos = window.scrollY;
  let moving = false;
  let last = 0;

  const tick = (now: number) => {
    const dt = Math.min(now - last, 50);
    last = now;
    const delta = pos - window.scrollY;
    // Frame-rate independent form of `scrollTop += (pos - scrollTop) / smooth`.
    const step = delta * (1 - Math.pow(1 - 1 / WHEEL_EASE, dt * 0.06));
    if (Math.abs(delta) < 0.5) {
      window.scrollTo(0, pos);
      moving = false;
      return;
    }
    window.scrollTo(0, window.scrollY + step);
    requestAnimationFrame(tick);
  };
  const run = () => {
    if (moving) return;
    moving = true;
    last = performance.now();
    requestAnimationFrame(tick);
  };

  scrollTo = (y) => {
    if (reduced()) return window.scrollTo(0, y);
    pos = Math.max(0, Math.min(y, max()));
    run();
  };

  const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.defaultPrevented || reduced() || canScrollInside(event.target)) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
    event.preventDefault();
    if (!moving) pos = window.scrollY;
    // The last stretch of the page (contact and footer) is short and felt slow: scroll it faster.
    const boost = window.scrollY > max() - window.innerHeight * 2.2 ? 2.4 : 1;
    pos = Math.max(0, Math.min(pos + event.deltaY * unit * WHEEL_SPEED * boost, max()));
    run();
  };
  // Keyboard, scrollbar drag and anchors scroll natively; keep the target in step with them.
  const onScroll = () => {
    if (!moving) pos = window.scrollY;
  };
  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("scroll", onScroll, { passive: true });
  root.dataset.smooth = "true";
}

// ---- cursor follower -----------------------------------------------------------------------------

const INTERACTIVE = 'a[href], button, [role="button"], summary, label, input, textarea, select';

function startCursor() {
  if (!finePointer()) return;
  const dot = document.createElement("div");
  dot.className = "nx-cursor";
  dot.setAttribute("aria-hidden", "true");
  document.body.append(dot);
  let mouseX = -100;
  let mouseY = -100;
  let x = mouseX;
  let y = mouseY;
  let last = performance.now();

  const frame = (now: number) => {
    const dt = Math.min(now - last, 50);
    last = now;
    // le-lab: pos += (mouse - pos) / 9 on every 16 ms tick.
    const k = 1 - Math.pow(1 - 1 / 9, dt / 16);
    x += (mouseX - x) * k;
    y += (mouseY - y) * k;
    dot.style.transform = `translate3d(${x - 12}px, ${y - 12}px, 0)`;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  document.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    mouseX = event.clientX;
    mouseY = event.clientY;
    dot.dataset.visible = reduced() ? "false" : "true";
    const target = event.target instanceof Element ? event.target : null;
    dot.dataset.active = target?.closest(INTERACTIVE) ? "true" : "false";
  });
  document.documentElement.addEventListener("pointerleave", () => {
    dot.dataset.visible = "false";
  });
}

// ---- magnetic buttons ----------------------------------------------------------------------------

const MAGNETIC = '.rp-enter, .rp-menu-btn, .rp-menu-cta, .nx-actions [data-slot="button"], .nx-close [data-slot="button"]';
const MAGNET_STRENGTH = 36;

function startMagnets() {
  if (!finePointer()) return;
  let current: HTMLElement | null = null;
  const release = (node: HTMLElement | null) => {
    if (node) node.style.translate = "";
  };
  document.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    const hit = event.target instanceof Element ? event.target.closest<HTMLElement>(MAGNETIC) : null;
    if (hit !== current) {
      release(current);
      current = hit;
      current?.setAttribute("data-magnetic", "");
    }
    if (!current || reduced()) return;
    const box = current.getBoundingClientRect();
    const dx = ((event.clientX - box.left) / box.width - 0.5) * MAGNET_STRENGTH;
    const dy = ((event.clientY - box.top) / box.height - 0.5) * MAGNET_STRENGTH;
    current.style.translate = `${dx}px ${dy}px`;
  });
  document.documentElement.addEventListener("pointerleave", () => {
    release(current);
    current = null;
  });
}

// ---- page transition -----------------------------------------------------------------------------

const CURTAIN_KEY = "nexo:curtain";
const CURTAIN_EASE = "cubic-bezier(0.87, 0, 0.13, 1)"; // Expo.easeInOut

function flag(set?: boolean) {
  try {
    if (set === true) sessionStorage.setItem(CURTAIN_KEY, "1");
    else if (set === false) sessionStorage.removeItem(CURTAIN_KEY);
    else return sessionStorage.getItem(CURTAIN_KEY) === "1";
  } catch {
    /* sem armazenamento: a página só entra sem a cortina */
  }
  return false;
}

/** Fades the page in on first load and lifts the curtain after a route change. Call before rendering. */
export function startPageEntrance() {
  const curtain = document.createElement("div");
  curtain.className = "nx-curtain";
  curtain.setAttribute("aria-hidden", "true");
  document.body.append(curtain);

  if (reduced()) {
    flag(false);
    return curtain;
  }
  const arriving = flag();
  flag(false);
  const root = document.getElementById("root");
  if (arriving) {
    curtain.style.transform = "translateY(0)";
    curtain
      .animate(
        [{ transform: "translateY(0)" }, { transform: "translateY(-100%)" }],
        { duration: 1000, delay: 250, easing: CURTAIN_EASE, fill: "forwards" },
      )
      .finished.then(() => {
        curtain.style.transform = "";
      })
      .catch(() => {});
  }
  root?.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: 1000,
    delay: arriving ? 450 : 100,
    easing: "ease",
    fill: "backwards",
  });
  // Returning with the back button restores the old page from memory; make sure no curtain is left on it.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      curtain.getAnimations().forEach((animation) => animation.cancel());
      curtain.style.transform = "";
    }
  });
  return curtain;
}

function startCurtainLinks(curtain: HTMLElement) {
  document.addEventListener("click", (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      reduced()
    )
      return;
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
    if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || !/^https?:$/.test(url.protocol)) return;
    if (url.pathname === window.location.pathname && url.search === window.location.search) return; // #anchors
    if (/^\/admin(?:\/|$)/.test(url.pathname)) return; // the panel has its own chrome
    event.preventDefault();
    flag(true);
    curtain
      .animate(
        [{ transform: "translateY(100%)" }, { transform: "translateY(0)" }],
        { duration: 800, easing: CURTAIN_EASE, fill: "forwards" },
      )
      .finished.then(() => window.location.assign(url.href))
      .catch(() => window.location.assign(url.href));
  });
}

/** Wires every effect for the public pages. */
export function startSiteEffects(curtain: HTMLElement) {
  startSmoothScroll();
  startCursor();
  startMagnets();
  startCurtainLinks(curtain);
}
