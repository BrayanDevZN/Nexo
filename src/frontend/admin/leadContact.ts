import type { SalesChannel } from "./api";

/** Which contact the team wants from the leads found on the map. */
export type ContactChoice = "any" | "whatsapp" | "email" | "instagram" | "site" | "both";

export const CONTACT_CHOICES: { value: ContactChoice; label: string }[] = [
  { value: "any", label: "Todos os contatos" },
  { value: "whatsapp", label: "WhatsApp (celular)" },
  { value: "email", label: "E-mail" },
  { value: "instagram", label: "Instagram" },
  { value: "site", label: "Site" },
  { value: "both", label: "WhatsApp e e-mail" },
];

// Links that are not a company's own site: networks and link-in-bio pages. Instagram has its own contact.
const SOCIAL_HOSTS = ["facebook.com", "fb.com", "fb.me", "wa.me", "whatsapp.com", "linktr.ee", "tiktok.com", "youtube.com", "youtu.be", "x.com", "twitter.com", "linkedin.com", "beacons.ai"];

function hostOf(url: string | null | undefined): string | null {
  const text = (url ?? "").trim();
  if (!text) return null;
  try {
    return new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `https://${text}`).hostname.toLowerCase().replace(/^(www|m)\./, "");
  } catch {
    return null;
  }
}
const onHost = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** The map gives one "website" per company; when it is an Instagram profile, that is the Instagram contact. */
export function instagramUrl(website: string | null | undefined): string | null {
  const host = hostOf(website);
  return host && (onHost(host, "instagram.com") || host === "instagr.am") ? (website ?? "").trim() : null;
}

/** The company's own site: any website that is not Instagram nor another social network or link page. */
export function siteUrl(website: string | null | undefined): string | null {
  const host = hostOf(website);
  if (!host || instagramUrl(website) || SOCIAL_HOSTS.some(domain => onHost(host, domain))) return null;
  return (website ?? "").trim();
}

/** "@usuario" from an Instagram link, or the link itself when there is no profile in it. */
export function instagramHandle(url: string): string {
  try {
    const first = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(url) ? url : `https://${url}`).pathname.split("/").filter(Boolean)[0];
    return first ? `@${first}` : url;
  } catch {
    return url;
  }
}

/**
 * A Brazilian mobile number: area code plus nine digits starting with 9. The map lists landlines too,
 * and a landline rarely has WhatsApp, so "has a phone" is not enough to count as WhatsApp.
 */
export function isMobilePhone(phone: string | null | undefined): boolean {
  let digits = (phone ?? "").replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) digits = digits.slice(2);
  return digits.length === 11 && digits[2] === "9";
}

export function hasEmail(emails: string | null | undefined): boolean {
  return /[^\s,;@]+@[^\s,;@]+\.[^\s,;@]+/.test(emails ?? "");
}

type LeadContacts = { phone: string | null; emails: string | null; website?: string | null };

export function matchesContact(lead: LeadContacts, choice: ContactChoice): boolean {
  const whatsapp = isMobilePhone(lead.phone), email = hasEmail(lead.emails);
  switch (choice) {
    case "whatsapp": return whatsapp;
    case "email": return email;
    case "instagram": return instagramUrl(lead.website) !== null;
    case "site": return siteUrl(lead.website) !== null;
    case "both": return whatsapp && email;
    default: return true;
  }
}

/** Which contacts the screen, the CSV and the saved lead show for each choice. "Todos" shows them all. */
export function contactParts(choice: ContactChoice) {
  return {
    phone: choice === "any" || choice === "whatsapp" || choice === "both",
    email: choice === "any" || choice === "email" || choice === "both",
    instagram: choice === "any" || choice === "instagram",
    site: choice === "any" || choice === "site",
  };
}

/** Looking for e-mails means the search has to read the companies' websites. */
export const needsEmailSearch = (choice: ContactChoice) => choice === "email" || choice === "both";

/** The sales channel saved on the leads: one contact is a channel (the site has none); several (or "todos") leave it empty. */
export function channelFor(choice: ContactChoice): SalesChannel | null {
  return choice === "whatsapp" ? "whatsapp" : choice === "email" ? "email" : choice === "instagram" ? "instagram" : null;
}
