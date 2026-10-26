/**
 * Measurement for the paid-traffic pages.
 *
 * Nothing is loaded and no cookie is set until the visitor accepted cookies in the notice. The privacy policy lives
 * at /privacidade. The tag ID is public (it is visible in any page that uses it), so it ships with the code;
 * VITE_GOOGLE_TAG_ID overrides it (for example to point a staging build at another account).
 */
import { readConsent } from "./consent";

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

const DEFAULT_TAG_ID = "AW-18538355330";
const TAG_ID = (import.meta.env.VITE_GOOGLE_TAG_ID as string | undefined)?.trim() || DEFAULT_TAG_ID;
const TAG_PATTERN = /^(G|GT|AW)-[A-Z0-9]{4,20}$/;

/** True when a valid tag is configured, so the cookie notice has something to ask about. */
export function trackingConfigured(): boolean {
  return Boolean(TAG_ID && TAG_PATTERN.test(TAG_ID));
}

export function initTracking(): void {
  if (!TAG_ID || !trackingConfigured() || readConsent() !== "granted" || window.gtag) return;
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
