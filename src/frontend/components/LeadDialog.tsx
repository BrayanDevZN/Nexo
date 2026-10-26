import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { saveLead } from "@/lib/leads";
import { trackLeadSaved, trackWhatsappClick } from "@/lib/tracking";

type Props = { page: string; placement: string | null; whatsappHref: string; search: string; onClose: () => void };
type Status = "idle" | "sending" | "done";

/** Collects the visitor's contact, saves it in the CRM and then opens the WhatsApp conversation. */
export function LeadDialog({ page, placement, whatsappHref, search, onClose }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(true);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;
    const data = new FormData(event.currentTarget);
    const text = (key: string) => String(data.get(key) || "").trim();
    setError(""); setStatus("sending");
    // Opened now, inside the click, so the browser does not block it; it is pointed at WhatsApp once the lead is saved.
    const popup = window.open("", "_blank");
    const result = await saveLead(page, { name: text("name"), phone: text("phone"), email: text("email"), website: text("website") }, search);
    if (result === "invalid") {
      popup?.close();
      setStatus("idle");
      setError("Confira o nome e o WhatsApp (com DDD) e tente de novo.");
      return;
    }
    if (result === "saved") trackLeadSaved(page, placement ?? "unknown");
    setSaved(result === "saved");
    trackWhatsappClick(page, placement ?? "unknown");
    if (popup) popup.location.href = whatsappHref;
    setStatus("done");
  }

  return (
    <Dialog open={placement !== null} onOpenChange={open => { if (!open && status !== "sending") { onClose(); setStatus("idle"); setError(""); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{status === "done" ? "Tudo certo!" : "Fale com a Nexo"}</DialogTitle>
          <DialogDescription>
            {status === "done"
              ? (saved ? "Recebemos seu contato e abrimos a conversa no WhatsApp." : "Abrimos a conversa no WhatsApp.")
              : "Deixe seu nome e seu WhatsApp. Abrimos a conversa para você e podemos retornar o contato."}
          </DialogDescription>
        </DialogHeader>
        {status === "done" ? (
          <Button asChild size="lg">
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer">Abrir o WhatsApp de novo</a>
          </Button>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate={false}>
            <Field>
              <FieldLabel htmlFor="lead-name">Seu nome</FieldLabel>
              <Input id="lead-name" name="name" autoComplete="name" required minLength={2} maxLength={160} />
            </Field>
            <Field>
              <FieldLabel htmlFor="lead-phone">WhatsApp com DDD</FieldLabel>
              <Input id="lead-phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" required minLength={10} maxLength={30} placeholder="(31) 99999-9999" />
            </Field>
            <Field>
              <FieldLabel htmlFor="lead-email">E-mail (opcional)</FieldLabel>
              <Input id="lead-email" name="email" type="email" autoComplete="email" maxLength={254} />
            </Field>
            {/* Hidden from people; bots fill it in and the server discards those submissions. */}
            <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
              <label>Site <input name="website" tabIndex={-1} autoComplete="off" /></label>
            </div>
            <label className="flex items-start gap-2 text-sm leading-snug">
              <input type="checkbox" name="consent" required className="mt-1" />
              <span>
                Concordo em ser contatado(a) pela Nexo por WhatsApp ou e-mail e li a{" "}
                <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">política de privacidade</a>.
              </span>
            </label>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" size="lg" disabled={status === "sending"}>
              {status === "sending" ? "Enviando…" : "Continuar no WhatsApp"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
