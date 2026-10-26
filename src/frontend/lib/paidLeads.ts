import { apiBase } from "@/admin/api";
import { campaignOrigin, clickId } from "./whatsapp";

/**
 * Saves the visitors that come from a paid ad, in the commercial team's paid-traffic funnel.
 * The first two stages happen on the site: the visit and the click on the WhatsApp button.
 * Nothing is stored on the device, and visits that did not come from an ad are not recorded.
 * Failures are ignored on purpose: tracking must never get in the way of the visitor.
 */
const base = apiBase(import.meta.env.PROD ? "/api" : (import.meta.env.VITE_API_URL as string | undefined) || "");

let visit: Promise<string | null> | null = null;

function post(path: string, body: unknown, fetcher: typeof fetch): Promise<Response> {
  // keepalive lets the request finish even if the click navigates away from the page.
  return fetcher(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true });
}

export function recordVisit(page: string, search: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  if (visit) return visit;
  const origin = campaignOrigin(search);
  if (origin !== "google-ads") return (visit = Promise.resolve(null));
  visit = post("/public/paid-leads/visit", { page, origin, click_id: clickId(search) }, fetcher)
    .then(response => (response.ok ? response.json() : { id: null }))
    .then((data: { id?: string | null }) => data.id ?? null)
    .catch(() => null);
  return visit;
}

export async function recordWhatsappClick(placement: string, fetcher: typeof fetch = fetch): Promise<void> {
  const id = await (visit ?? Promise.resolve(null));
  if (!id) return;
  try { await post(`/public/paid-leads/${id}/whatsapp`, { placement }, fetcher); } catch { /* ignored */ }
}

/** For tests: forget the visit of the previous page load. */
export function resetPaidLeadTracking(): void { visit = null; }
