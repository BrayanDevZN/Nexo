import { Globe, Mail, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { whatsappUrl } from "./contact";

function InstagramIcon({ className = "size-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
  </svg>;
}

// Only web links are opened from a button.
const safeLink = (value?: string | null) => (value && /^https?:\/\//i.test(value.trim()) ? value.trim() : "");

type Contactable = { name: string; phone?: string | null; email?: string | null; instagram?: string | null; website?: string | null };

/** One button for each way to reach a client: WhatsApp (phone), e-mail and Instagram. Only the ones the client has. */
export function ContactButtons({ client, whatsappClassName }: { client: Contactable; whatsappClassName?: string }) {
  const whatsapp = client.phone ? whatsappUrl(client.phone, client.name) : "";
  const email = client.email?.trim() ? `mailto:${client.email.trim()}` : "";
  const instagram = safeLink(client.instagram), website = safeLink(client.website);
  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();
  return <>
    {whatsapp && <Button asChild size="sm" variant="outline" className={whatsappClassName}><a href={whatsapp} target="_blank" rel="noreferrer" draggable={false} onClick={stop} aria-label={"Entrar em contato com " + client.name + " pelo WhatsApp"}><MessageCircle data-icon="inline-start" /> WhatsApp</a></Button>}
    {email && <Button asChild size="sm" variant="outline"><a href={email} draggable={false} onClick={stop} aria-label={"Enviar e-mail para " + client.name}><Mail data-icon="inline-start" /> E-mail</a></Button>}
    {instagram && <Button asChild size="sm" variant="outline"><a href={instagram} target="_blank" rel="noopener noreferrer" draggable={false} onClick={stop} aria-label={"Abrir o Instagram de " + client.name}><InstagramIcon /> Instagram</a></Button>}
    {website && <Button asChild size="sm" variant="outline"><a href={website} target="_blank" rel="noopener noreferrer" draggable={false} onClick={stop} aria-label={"Abrir o site de " + client.name}><Globe data-icon="inline-start" /> Site</a></Button>}
  </>;
}
