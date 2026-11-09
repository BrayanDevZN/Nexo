/** Pure helpers for the paid-traffic landing pages. No imports on purpose: they run in unit tests too. */

/** Where the visit came from, read from the ad click or the UTM tags. Null when it looks organic. */
export function campaignOrigin(search: string): string | null {
  const params = new URLSearchParams(search);
  if (params.get("gclid") || params.get("gbraid") || params.get("wbraid")) return "google-ads";
  const source = (params.get("utm_source") || "").trim().toLowerCase();
  return /^[a-z0-9_.-]{1,30}$/.test(source) ? source : null;
}

/** wa.me link with a ready message. A known origin is appended so each conversation says where it came from. */
export function whatsappLink(number: string, message: string, origin: string | null): string {
  const text = origin ? `${message} (origem: ${origin})` : message;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/** The ad click identifier (gclid and its iOS variants), kept so a lead can later be tied back to its ad. */
export function clickId(search: string): string | null {
  const params = new URLSearchParams(search);
  for (const key of ["gclid", "gbraid", "wbraid"]) {
    const value = (params.get(key) || "").trim();
    if (/^[A-Za-z0-9_-]{1,200}$/.test(value)) return value;
  }
  return null;
}
