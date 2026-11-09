/** The visitor's cookie choice. Stored only in this browser; nothing is sent anywhere. */
export type Consent = "granted" | "denied";

const KEY = "nexo-cookie-consent";
export const PREFERENCES_EVENT = "nexo:cookie-preferences";

export function readConsent(): Consent | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

export function saveConsent(value: Consent): void {
  try {
    window.localStorage.setItem(KEY, value);
  } catch {
    /* Storage blocked: the choice only lasts until the page closes. */
  }
}
