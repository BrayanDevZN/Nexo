/**
 * Measurement for the paid-traffic pages.
 *
 * Nothing is loaded and no cookie is set until VITE_GOOGLE_TAG_ID holds a real Google tag ID (G-, GT- or AW-).
 * Only configure it once the privacy policy and the cookie notice are published.
 */
type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

const TAG_ID = (import.meta.env.VITE_GOOGLE_TAG_ID as string | undefined)?.trim();
const TAG_PATTERN = /^(G|GT|AW)-[A-Z0-9]{4,20}$/;

export function initTracking(): void {
  if (!TAG_ID || !TAG_PATTERN.test(TAG_ID) || window.gtag) return;
  window.dataLayer = window.dataLayer || [];
  // The gtag snippet must push the arguments object itself, not an array.
  window.gtag = function gtag() {
    window.dataLayer?.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", TAG_ID);
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(TAG_ID)}`;
  document.head.append(script);
}

/** The main conversion: someone clicked to talk on WhatsApp. A click is not yet a conversation. */
export function trackWhatsappClick(page: string, placement: string): void {
  window.gtag?.("event", "whatsapp_click", { page, placement });
}
