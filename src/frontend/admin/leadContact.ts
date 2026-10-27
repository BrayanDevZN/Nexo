import type { SalesChannel } from "./api";

/** Which contact the team wants from the leads found on the map. */
export type ContactChoice = "any" | "whatsapp" | "email" | "both";

export const CONTACT_CHOICES: { value: ContactChoice; label: string }[] = [
  { value: "any", label: "Qualquer contato" },
  { value: "whatsapp", label: "WhatsApp (celular)" },
  { value: "email", label: "E-mail" },
  { value: "both", label: "WhatsApp e e-mail" },
];

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

export function matchesContact(lead: { phone: string | null; emails: string | null }, choice: ContactChoice): boolean {
  const whatsapp = isMobilePhone(lead.phone), email = hasEmail(lead.emails);
  return choice === "whatsapp" ? whatsapp : choice === "email" ? email : choice === "both" ? whatsapp && email : true;
}

/** Looking for e-mails means the search has to read the companies' websites. */
export const needsEmailSearch = (choice: ContactChoice) => choice === "email" || choice === "both";

/** The sales channel saved on the leads: one contact is a channel; two (or none) leave it empty. */
export function channelFor(choice: ContactChoice): SalesChannel | null {
  return choice === "whatsapp" ? "whatsapp" : choice === "email" ? "email" : null;
}
