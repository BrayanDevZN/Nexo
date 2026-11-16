import { useEffect, useState, type FormEvent } from "react";
import { ChevronsUpDown, Plus, Search, UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldDescription } from "@/components/ui/field";
import { Field, FieldGroup, FieldLabel, TextField, Busy, Feedback, message } from "@/admin/shared";
import type { BookingApi } from "./api";
import { formatDate } from "./api";
import { initials } from "./Photo";

export type Customer = { name: string; phone: string | null; email: string | null };
type Known = Customer & { appointments: number; last_appointment_at: string | null };

const contact = (customer: Customer) => [customer.phone, customer.email].filter(Boolean).join(" · ");

/**
 * "Cliente" as one button. It opens a list of the people already booked at this business (like the file picker of
 * Google Sheets): search, pick one, or add a new one. The appointment form only receives the chosen customer.
 */
export function CustomerField({ api, base, value, onChange, disabled }: {
  api: BookingApi; base: string; value: Customer | null; onChange: (customer: Customer) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Known[]>();
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    let active = true;
    // Typing waits a moment, so each keystroke does not become a request.
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({ limit: "100" });
      if (search.trim()) query.set("search", search.trim());
      api.request<Known[]>(base + "/customers?" + query)
        .then(list => { if (active) { setRows(list); setError(""); } })
        .catch(e => { if (active) setError(message(e)); });
    }, search ? 250 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [api, base, open, search]);
  function show() { setSearch(""); setRows(undefined); setCreating(false); setError(""); setOpen(true); }
  function choose(customer: Customer) { onChange(customer); setOpen(false); }
  function createNew(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); event.stopPropagation();
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    if (!values.name.trim()) { setError("Informe o nome do cliente."); return; }
    choose({ name: values.name.trim(), phone: values.phone.trim() || null, email: values.email.trim() || null });
  }
  return <Field>
    <FieldLabel>Cliente</FieldLabel>
    <Button type="button" variant="outline" className="bk-customer-button" disabled={disabled} onClick={show} aria-haspopup="dialog">
      {value ? <>
        <Avatar className="size-8"><AvatarFallback>{initials(value.name) || "?"}</AvatarFallback></Avatar>
        <span className="bk-customer-text"><strong>{value.name}</strong><small>{contact(value) || "Sem contato"}</small></span>
      </> : <><UserRound data-icon="inline-start" /><span className="bk-customer-text"><strong>Escolher cliente</strong></span></>}
      <ChevronsUpDown className="ml-auto" aria-hidden="true" />
    </Button>
    <FieldDescription>{value ? "Toque para trocar o cliente." : "Escolha entre os clientes já atendidos ou cadastre um novo."}</FieldDescription>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="bk-picker">
        <DialogHeader><DialogTitle>{creating ? "Novo cliente" : "Escolher cliente"}</DialogTitle>
          <DialogDescription>{creating ? "Preencha o nome; celular e e-mail ajudam a falar com ele depois." : "Clientes que já foram atendidos neste negócio."}</DialogDescription></DialogHeader>
        <Feedback error={error} />
        {creating ? <form onSubmit={createNew} className="flex flex-col gap-4">
          <FieldGroup>
            <TextField label="Nome" name="name" required maxLength={160} autoFocus />
            <TextField label="Celular" name="phone" type="tel" maxLength={30} />
            <TextField label="E-mail" name="email" type="email" />
          </FieldGroup>
          <div className="bk-row"><Button type="submit">Usar este cliente</Button><Button type="button" variant="outline" onClick={() => { setCreating(false); setError(""); }}>Voltar</Button></div>
        </form> : <>
          <div className="bk-search"><Search aria-hidden="true" /><input type="search" aria-label="Buscar cliente" placeholder="Buscar por nome, celular ou e-mail" value={search} onChange={e => setSearch(e.target.value)} maxLength={160} autoFocus /></div>
          <div className="bk-picker-list" role="listbox" aria-label="Clientes">
            {!rows ? <div className="bk-picker-empty"><Busy /></div>
              : rows.length === 0 ? <p className="bk-picker-empty bk-muted">{search ? "Nenhum cliente com essa busca." : "Ainda não há clientes neste negócio."}</p>
              : rows.map(row => <button type="button" role="option" aria-selected={value?.name === row.name && value?.phone === row.phone} className="bk-picker-item" key={row.name + "|" + (row.phone || "")} onClick={() => choose({ name: row.name, phone: row.phone, email: row.email })}>
                <Avatar className="size-9"><AvatarFallback>{initials(row.name) || "?"}</AvatarFallback></Avatar>
                <span className="bk-customer-text"><strong>{row.name}</strong><small>{contact(row) || "Sem contato"}</small></span>
                <small className="bk-picker-meta">{row.appointments} {row.appointments === 1 ? "atendimento" : "atendimentos"}{row.last_appointment_at ? " · " + formatDate(row.last_appointment_at) : ""}</small>
              </button>)}
          </div>
          <Button type="button" onClick={() => { setCreating(true); setError(""); }}><Plus data-icon="inline-start" />Novo cliente{search.trim() ? ": " + search.trim() : ""}</Button>
        </>}
      </DialogContent>
    </Dialog>
  </Field>;
}
