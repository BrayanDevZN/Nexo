import { apiBase } from "@/admin/api";
import { campaignOrigin, clickId } from "./whatsapp";

export type LeadForm = { name: string; phone: string; email: string; website: string };
/** saved: it is in the CRM. invalid: the server rejected the data. failed: it could not be saved right now. */
export type LeadResult = "saved" | "invalid" | "failed";

const base = apiBase(import.meta.env.PROD ? "/api" : (import.meta.env.VITE_API_URL as string | undefined) || "");

export async function saveLead(page: string, form: LeadForm, search: string, fetcher: typeof fetch = fetch): Promise<LeadResult> {
  try {
    const response = await fetcher(base + "/public/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name, phone: form.phone, email: form.email, website: form.website, page, consent: true,
        origin: campaignOrigin(search), click_id: clickId(search),
      }),
    });
    if (response.ok) return "saved";
    return response.status === 422 ? "invalid" : "failed";
  } catch {
    return "failed";
  }
}
