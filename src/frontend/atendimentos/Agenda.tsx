import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Busy, Feedback, Field, FieldGroup, FieldLabel, TextField, message } from "@/admin/shared";
import {
  can, dayBounds, dayKey, formatMoney, formatTime, isoToLocal, localToIso, STATUS_LABELS,
  type Appointment, type AppointmentStatus, type BookingApi, type Business, type Member, type Overview, type Service,
} from "./api";

const STATUSES: AppointmentStatus[] = ["scheduled", "confirmed", "done", "cancelled", "no_show"];
const BADGE: Record<AppointmentStatus, "default" | "secondary" | "outline" | "destructive"> = { scheduled: "secondary", confirmed: "default", done: "outline", cancelled: "destructive", no_show: "destructive" };

/** The day's appointments, the counts of the week and a plain form to book or change one. */
export function Agenda({ api, business }: { api: BookingApi; business: Business }) {
  const [day, setDay] = useState(() => dayKey(new Date()));
  const [rows, setRows] = useState<Appointment[]>();
  const [overview, setOverview] = useState<Overview>();
  const [services, setServices] = useState<Service[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [editing, setEditing] = useState<Appointment | "new">();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const writes = can.writeAppointments(business.my_role);
  const base = "/businesses/" + business.id;
  async function load() {
    try {
      const query = new URLSearchParams({ ...dayBounds(day), limit: "100" });
      const [list, counts] = await Promise.all([api.request<Appointment[]>(base + "/appointments?" + query), api.request<Overview>(base + "/overview")]);
      setRows(list); setOverview(counts);
    } catch (e) { setError(message(e)); }
  }
  useEffect(() => { setRows(undefined); void load(); }, [business.id, day]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let active = true;
    void Promise.all([api.request<Service[]>(base + "/services?active=true"), api.request<Member[]>(base + "/members")])
      .then(([list, team]) => { if (active) { setServices(list); setMembers(team); } }).catch(() => undefined);
    return () => { active = false; };
  }, [api, base, editing]);
  function shift(days: number) { const date = new Date(day + "T00:00:00"); date.setDate(date.getDate() + days); setDay(dayKey(date)); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !editing) return;
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    const body: Record<string, unknown> = {
      customer_name: values.customer_name, customer_phone: values.customer_phone || null, customer_email: values.customer_email || null,
      service_id: values.service_id || null, service_name: values.service_id ? null : values.service_name || null,
      staff_user_id: values.staff_user_id || null, starts_at: localToIso(values.starts_at),
      ends_at: values.ends_at ? localToIso(values.ends_at) : null, notes: values.notes || null,
      price: values.price ? values.price.replace(",", ".") : null,
    };
    if (editing !== "new") body.status = values.status;
    setBusy(true); setError("");
    try {
      if (editing === "new") await api.mutate(base + "/appointments", "POST", body);
      else await api.mutate(base + "/appointments/" + editing.id, "PATCH", body);
      setEditing(undefined); await load();
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  async function setStatus(appointment: Appointment, status: AppointmentStatus) {
    if (busy) return;
    setBusy(true); setError("");
    try { await api.mutate(base + "/appointments/" + appointment.id, "PATCH", { status }); setEditing(undefined); await load(); }
    catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  async function remove(appointment: Appointment) {
    if (busy || !window.confirm(`Apagar o atendimento de ${appointment.customer_name}?`)) return;
    setBusy(true); setError("");
    try { await api.mutate(base + "/appointments/" + appointment.id, "DELETE"); setEditing(undefined); await load(); }
    catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  const current = editing === "new" ? undefined : editing;
  const defaultStart = current ? isoToLocal(current.starts_at) : day + "T09:00";
  return <section className="flex flex-col gap-4">
    <div className="bk-row bk-row-between"><h1>Agenda</h1>{writes && !editing && <Button onClick={() => setEditing("new")}>Marcar atendimento</Button>}</div>
    {overview && <div className="bk-stats">
      <div className="bk-stat"><strong>{overview.today}</strong><span>hoje</span></div>
      <div className="bk-stat"><strong>{overview.next_7_days}</strong><span>próximos 7 dias</span></div>
      <div className="bk-stat"><strong>{overview.upcoming}</strong><span>futuros</span></div>
      <div className="bk-stat"><strong>{overview.by_status.done}</strong><span>concluídos</span></div>
    </div>}
    <Feedback error={error} />
    {editing && <Card><CardHeader><CardTitle>{current ? "Atendimento" : "Novo atendimento"}</CardTitle></CardHeader>
      <CardContent><form onSubmit={submit} className="flex flex-col gap-4" key={current?.id || "new"}>
        <FieldGroup>
          <TextField label="Nome do cliente" name="customer_name" required maxLength={160} defaultValue={current?.customer_name || ""} />
          <TextField label="Celular do cliente" name="customer_phone" type="tel" maxLength={30} defaultValue={current?.customer_phone || ""} />
          <Field><FieldLabel htmlFor="bk-service">Serviço</FieldLabel>
            <NativeSelect id="bk-service" name="service_id" defaultValue={current?.service_id || ""}>
              <NativeSelectOption value="">Outro (escrever abaixo)</NativeSelectOption>
              {services.map(service => <NativeSelectOption key={service.id} value={service.id}>{service.name} · {service.duration_minutes} min</NativeSelectOption>)}
            </NativeSelect></Field>
          <TextField label="Nome do serviço, se não estiver na lista" name="service_name" maxLength={160} defaultValue={current && !current.service_id ? current.service_name : ""} />
          <div className="bk-grid-2">
            <TextField label="Início" name="starts_at" type="datetime-local" required defaultValue={defaultStart} />
            <TextField label="Fim" name="ends_at" type="datetime-local" defaultValue={current ? isoToLocal(current.ends_at) : ""} help="Pode deixar vazio: usa a duração do serviço." />
          </div>
          <Field><FieldLabel htmlFor="bk-staff">Quem atende</FieldLabel>
            <NativeSelect id="bk-staff" name="staff_user_id" defaultValue={current?.staff_user_id || ""}>
              <NativeSelectOption value="">Qualquer pessoa</NativeSelectOption>
              {members.map(member => <NativeSelectOption key={member.user_id} value={member.user_id}>{member.name}</NativeSelectOption>)}
            </NativeSelect></Field>
          <TextField label="Preço (R$)" name="price" inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" placeholder="Usa o preço do serviço" defaultValue={current?.price ?? ""} />
          {current && <Field><FieldLabel htmlFor="bk-status">Situação</FieldLabel>
            <NativeSelect id="bk-status" name="status" defaultValue={current.status}>
              {STATUSES.map(status => <NativeSelectOption key={status} value={status}>{STATUS_LABELS[status]}</NativeSelectOption>)}
            </NativeSelect></Field>}
          <Field><FieldLabel htmlFor="bk-notes">Observações</FieldLabel><Textarea id="bk-notes" name="notes" maxLength={5000} defaultValue={current?.notes || ""} /></Field>
        </FieldGroup>
        <div className="bk-row">
          <Button type="submit" disabled={busy}>{busy ? <Busy>Salvando…</Busy> : "Salvar"}</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(undefined)}>Cancelar</Button>
          {current && can.deleteAppointments(business.my_role) && <Button type="button" variant="destructive" disabled={busy} onClick={() => remove(current)}>Apagar</Button>}
        </div>
        {current && <div className="bk-status" aria-label="Mudar situação rapidamente">
          {STATUSES.filter(status => status !== current.status).map(status => <Button key={status} type="button" size="sm" variant="outline" disabled={busy} onClick={() => setStatus(current, status)}>{STATUS_LABELS[status]}</Button>)}
        </div>}
      </form></CardContent></Card>}
    <div className="bk-day">
      <Button variant="outline" size="icon-lg" aria-label="Dia anterior" onClick={() => shift(-1)}>‹</Button>
      <input type="date" aria-label="Dia" value={day} onChange={e => e.target.value && setDay(e.target.value)} />
      <Button variant="outline" size="icon-lg" aria-label="Próximo dia" onClick={() => shift(1)}>›</Button>
      <Button variant="outline" onClick={() => setDay(dayKey(new Date()))}>Hoje</Button>
    </div>
    {!rows ? <Busy /> : rows.length === 0 ? <p className="bk-empty">Nenhum atendimento neste dia.</p>
      : <div className="bk-list">{rows.map(row => <button type="button" className="bk-item" data-status={row.status} key={row.id} disabled={!writes} onClick={() => setEditing(row)}>
        <div className="bk-item-time">{formatTime(row.starts_at)}<small>{formatTime(row.ends_at)}</small></div>
        <div className="bk-item-body"><strong>{row.customer_name}</strong>
          <span>{row.service_name}{row.staff_name ? " · " + row.staff_name : ""}{row.price !== null ? " · " + formatMoney(row.price) : ""}</span>
          {row.customer_phone && <span>{row.customer_phone}</span>}</div>
        <Badge variant={BADGE[row.status]}>{STATUS_LABELS[row.status]}</Badge>
      </button>)}</div>}
  </section>;
}
