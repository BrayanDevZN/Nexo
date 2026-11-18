import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Busy, Feedback, Field, FieldGroup, FieldLabel, TextField, message } from "@/admin/shared";
import { Plus, Scissors } from "lucide-react";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { can, formatMoney, type BookingApi, type Business, type Service } from "./api";

/** The services the business offers: name, how long each takes and the price. */
export function Services({ api, business }: { api: BookingApi; business: Business }) {
  const [rows, setRows] = useState<Service[]>();
  const [editing, setEditing] = useState<Service | "new">();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const editable = can.editServices(business.my_role);
  const base = "/businesses/" + business.id + "/services";
  async function load() {
    try { setRows(await api.request<Service[]>(base)); } catch (e) { setError(message(e)); }
  }
  useEffect(() => { setRows(undefined); void load(); }, [business.id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !editing) return;
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    const body = { name: values.name, description: values.description || null, duration_minutes: Number(values.duration_minutes),
      price: values.price ? values.price.replace(",", ".") : null, active: values.active === "on" };
    setBusy(true); setError("");
    try {
      if (editing === "new") await api.mutate(base, "POST", body);
      else await api.mutate(base + "/" + editing.id, "PATCH", body);
      setEditing(undefined); await load();
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  async function remove(service: Service) {
    if (busy || !window.confirm(`Excluir o serviço ${service.name}? Os atendimentos já marcados continuam com o nome.`)) return;
    setBusy(true); setError("");
    try { await api.mutate(base + "/" + service.id, "DELETE"); setEditing(undefined); await load(); }
    catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  const current = editing === "new" ? undefined : editing;
  return <section className="flex flex-col gap-4">
    <div className="bk-head"><div><h1>Serviços</h1>{rows && <p>{rows.length === 0 ? "Nenhum serviço cadastrado" : `${rows.length} ${rows.length === 1 ? "serviço" : "serviços"} · ${rows.filter(row => row.active).length} disponíveis para marcar`}</p>}</div>{editable && !editing && <Button onClick={() => setEditing("new")}><Plus data-icon="inline-start" />Novo serviço</Button>}</div>
    <Feedback error={error} />
    {editing && <Card><CardHeader><CardTitle>{current ? "Editar serviço" : "Novo serviço"}</CardTitle></CardHeader>
      <CardContent><form onSubmit={submit} className="flex flex-col gap-4" key={current?.id || "new"}>
        <FieldGroup>
          <TextField label="Nome" name="name" required maxLength={160} defaultValue={current?.name || ""} />
          <div className="bk-grid-2">
            <TextField label="Duração (minutos)" name="duration_minutes" type="number" inputMode="numeric" min={5} max={1440} step={5} required defaultValue={current?.duration_minutes ?? 30} />
            <TextField label="Preço (R$)" name="price" inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" placeholder="Opcional" defaultValue={current?.price ?? ""} />
          </div>
          <Field><FieldLabel htmlFor="bk-service-description">Descrição</FieldLabel><Textarea id="bk-service-description" name="description" maxLength={2000} defaultValue={current?.description || ""} /></Field>
          <label className="bk-check"><input type="checkbox" name="active" defaultChecked={current ? current.active : true} /> Disponível para marcar</label>
        </FieldGroup>
        <div className="bk-row">
          <Button type="submit" disabled={busy}>{busy ? <Busy>Salvando…</Busy> : "Salvar"}</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(undefined)}>Cancelar</Button>
          {current && <Button type="button" variant="destructive" disabled={busy} onClick={() => remove(current)}>Excluir</Button>}
        </div>
      </form></CardContent></Card>}
    {!rows ? <Busy /> : rows.length === 0 ? <Empty><EmptyHeader><EmptyMedia variant="icon"><Scissors /></EmptyMedia><EmptyTitle>Nenhum serviço ainda</EmptyTitle><EmptyDescription>{editable ? "Cadastre o que você oferece, com duração e preço, para marcar mais rápido." : "O dono ou um gerente cadastra os serviços."}</EmptyDescription></EmptyHeader>{editable && !editing && <EmptyContent><Button onClick={() => setEditing("new")}><Plus data-icon="inline-start" />Cadastrar serviço</Button></EmptyContent>}</Empty>
      : <div className="bk-list">{rows.map(service => <button type="button" className="bk-item" key={service.id} disabled={!editable} onClick={() => setEditing(service)}>
        <div className="bk-item-body"><strong>{service.name}</strong>
          <span>{service.duration_minutes} min{service.description ? " · " + service.description : ""}</span></div>
        {!service.active && <Badge variant="outline">Pausado</Badge>}
        <span className="bk-price">{service.price !== null ? formatMoney(service.price) : "—"}</span>
      </button>)}</div>}
  </section>;
}
