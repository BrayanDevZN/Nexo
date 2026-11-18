import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { CalendarPlus, ChevronLeft, ChevronRight, MessageCircle, Phone, Search, SlidersHorizontal } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Busy, Feedback, Field, FieldGroup, FieldLabel, TextField, message } from "@/admin/shared";
import { Picture } from "./Photo";
import { AppointmentFields, nowLocal } from "./AppointmentFields";
import {
  can, dayKey, isoToLocal, localToIso, STATUS_LABELS,
  type Appointment, type AppointmentStatus, type BookingApi, type Business, type Member, type Overview, type Service,
} from "./api";
import { Booker, CalendarView, Customize, Legend } from "./Calendar";
import {
  loadPrefs, savePrefs, shiftAnchor, startOfDay, viewRange, viewTitle, visibleDays,
  type CalendarPrefs, type CalendarView as View,
} from "./calendarPrefs";

const STATUSES: AppointmentStatus[] = ["scheduled", "confirmed", "done", "cancelled", "no_show"];
const VIEWS: { id: View; label: string }[] = [{ id: "day", label: "Dia" }, { id: "week", label: "Semana" }, { id: "month", label: "Mês" }, { id: "list", label: "Lista" }];
const PAGE = 100;

/** A calendar like Google's: day, week, month and list views, click a free slot to book it, and a Personalizar panel. */
export function Agenda({ api, business, liveTick = 0 }: { api: BookingApi; business: Business; liveTick?: number }) {
  const [prefs, setPrefs] = useState<CalendarPrefs>(() => loadPrefs(business.id));
  const [view, setView] = useState<View>(prefs.view);
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [statusFilter, setStatusFilter] = useState<"" | AppointmentStatus>("");
  const [customer, setCustomer] = useState("");
  const [rows, setRows] = useState<Appointment[]>();
  const [overview, setOverview] = useState<Overview>();
  const [services, setServices] = useState<Service[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [editing, setEditing] = useState<{ appointment?: Appointment; start?: string }>();
  const [customizing, setCustomizing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const writes = can.writeAppointments(business.my_role);
  const base = "/businesses/" + business.id;
  const days = useMemo(() => visibleDays(view, anchor, prefs), [view, anchor, prefs]);
  const range = useMemo(() => viewRange(view, anchor, prefs), [view, anchor, prefs]);
  function changePrefs(next: CalendarPrefs) { setPrefs(next); savePrefs(business.id, next); }
  // Answers can arrive out of order (a live change reloads while you save or delete): only the newest one is shown.
  const loading = useRef(0);
  async function load() {
    const id = ++loading.current;
    try {
      const all: Appointment[] = [];
      // The server returns at most 100 per request; a busy month needs a few pages.
      for (let offset = 0; offset < 600; offset += PAGE) {
        const query = new URLSearchParams({ limit: String(PAGE), offset: String(offset), starts_from: range.from.toISOString() });
        if (range.until) query.set("starts_until", range.until.toISOString());
        if (statusFilter) query.set("status", statusFilter);
        if (customer.trim()) query.set("customer", customer.trim());
        const page = await api.request<Appointment[]>(base + "/appointments?" + query);
        all.push(...page);
        if (page.length < PAGE) break;
      }
      const summary = await api.request<Overview>(base + "/overview");
      if (id !== loading.current) return;
      setRows(all); setOverview(summary); setError("");
    } catch (e) { if (id === loading.current) setError(message(e)); }
  }
  // The range is a pair of Dates; depend on its instants so the effect runs once per real change.
  useEffect(() => { setRows(undefined); void load(); }, [business.id, range.from.getTime(), range.until?.getTime(), statusFilter, customer]); // eslint-disable-line react-hooks/exhaustive-deps
  // Someone else booked, changed or removed an appointment: reload the visible range.
  useEffect(() => { if (liveTick > 0) void load(); }, [liveTick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let active = true;
    void Promise.all([api.request<Service[]>(base + "/services?active=true"), api.request<Member[]>(base + "/members")])
      .then(([list, team]) => { if (active) { setServices(list); setMembers(team); } }).catch(() => undefined);
    return () => { active = false; };
  }, [api, base, editing]);
  function pickView(next: View) { setView(next); if (next !== "list") setAnchor(a => next === "month" ? new Date(a.getFullYear(), a.getMonth(), 1) : a); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !editing) return;
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    const ids = JSON.parse(values.service_ids || "[]") as string[];
    const body: Record<string, unknown> = {
      customer_name: values.customer_name, customer_phone: values.customer_phone || null, customer_email: values.customer_email || null,
      service_ids: ids, staff_user_id: values.staff_user_id, notes: values.notes || null,
    };
    // Only the customer's name is required. No start means now; the end and the price are the sum of the services unless overwritten.
    if (values.starts_at) body.starts_at = localToIso(values.starts_at); else if (editing.appointment) { setError("Informe o início."); return; }
    if (values.ends_at) body.ends_at = localToIso(values.ends_at);
    if (!values.staff_user_id) { setError("Escolha quem atende."); return; }
    // The same professional cannot be in two appointments at once; another one can. The server decides, this just answers sooner.
    if (body.starts_at && body.ends_at && (rows ?? []).some(row => row.id !== editing.appointment?.id && row.staff_user_id === values.staff_user_id
        && (row.status === "scheduled" || row.status === "confirmed")
        && new Date(row.starts_at) < new Date(String(body.ends_at)) && new Date(row.ends_at) > new Date(String(body.starts_at)))) {
      setError("Esse funcionário já tem um agendamento nesse horário. Escolha outro horário ou outro funcionário."); return;
    }
    if (!ids.length && values.service_name) body.service_name = values.service_name;
    if (values.price) body.price = values.price.replace(",", ".");
    else if (editing.appointment) body.price = null;
    if (editing.appointment) body.status = values.status;
    setBusy(true); setError("");
    try {
      if (!editing.appointment) await api.mutate(base + "/appointments", "POST", body);
      else await api.mutate(base + "/appointments/" + editing.appointment.id, "PATCH", body);
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
    try {
      await api.mutate(base + "/appointments/" + appointment.id, "DELETE");
      // It leaves the screen at once; the reload below only confirms what the server has.
      setEditing(undefined); setRows(list => list?.filter(row => row.id !== appointment.id));
      await load();
    }
    catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  // An appointment that is open in the form and disappears from the agenda (someone deleted or moved it) closes the form.
  useEffect(() => {
    if (!rows || !editing?.appointment || busy) return;
    if (!rows.some(row => row.id === editing.appointment!.id)) { setEditing(undefined); setError("Esse horário foi apagado ou não está mais nesta agenda."); }
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = editing?.appointment;
  const defaultStart = current ? isoToLocal(current.starts_at) : editing?.start || nowLocal();
  const handlers = {
    onEvent: (row: Appointment) => { if (writes) setEditing({ appointment: row }); },
    onSlot: (start: string) => { if (writes) setEditing({ start }); },
    onDay: (day: Date) => { setAnchor(day); setView("day"); },
  };
  return <section className="flex flex-col gap-4">
    <div className="bk-head">
      <div><h1>Agenda</h1>{overview && <p>{overview.today === 0 ? "Nenhum atendimento hoje." : <><strong>{overview.today} {overview.today === 1 ? "atendimento" : "atendimentos"}</strong> hoje</>}{overview.next_7_days > 0 ? ` · ${overview.next_7_days} nos próximos 7 dias` : ""}</p>}</div>
      {writes && <Button onClick={() => setEditing({})}><CalendarPlus data-icon="inline-start" />Marcar atendimento</Button>}
    </div>
    {overview && <div className="bk-kpis">
      <div className="bk-kpi" data-hue><span>Hoje</span><strong>{overview.today}</strong><small>atendimentos marcados</small></div>
      <div className="bk-kpi"><span>Próximos 7 dias</span><strong>{overview.next_7_days}</strong><small>atendimentos</small></div>
      <div className="bk-kpi"><span>Futuros</span><strong>{overview.upcoming}</strong><small>ainda por vir</small></div>
      <div className="bk-kpi"><span>Concluídos</span><strong>{overview.by_status.done}</strong><small>já realizados</small></div>
    </div>}
    <Feedback error={error} />
    <div className="bk-cal">
      <div className="bk-cal-bar">
        <div className="bk-cal-nav">
          <Button variant="outline" size="sm" onClick={() => setAnchor(startOfDay(new Date()))}>Hoje</Button>
          {view !== "list" && <>
            <Button variant="ghost" size="icon-lg" aria-label="Anterior" onClick={() => setAnchor(shiftAnchor(view, anchor, -1))}><ChevronLeft /></Button>
            <Button variant="ghost" size="icon-lg" aria-label="Próximo" onClick={() => setAnchor(shiftAnchor(view, anchor, 1))}><ChevronRight /></Button>
          </>}
          <h2 className="bk-cal-title" aria-live="polite">{viewTitle(view, anchor, days)}</h2>
        </div>
        <div className="bk-cal-tools">
          <ToggleGroup type="single" value={view} onValueChange={value => { if (value) pickView(value as View); }} aria-label="Visão">
            {VIEWS.map(item => <ToggleGroupItem key={item.id} value={item.id}>{item.label}</ToggleGroupItem>)}
          </ToggleGroup>
          <Button variant="outline" size="icon-lg" aria-label="Personalizar agenda" onClick={() => setCustomizing(true)}><SlidersHorizontal /></Button>
        </div>
      </div>
      <form className="bk-cal-filters" onSubmit={event => { event.preventDefault(); setCustomer((new FormData(event.currentTarget).get("customer") as string) || ""); }}>
        <div className="bk-day"><input type="search" name="customer" aria-label="Buscar cliente" placeholder="Buscar cliente" defaultValue={customer} maxLength={160} /><Button type="submit" variant="outline" size="icon-lg" aria-label="Buscar"><Search /></Button></div>
        <NativeSelect aria-label="Situação" value={statusFilter} onChange={e => setStatusFilter(e.target.value as "" | AppointmentStatus)}>
          <NativeSelectOption value="">Todas as situações</NativeSelectOption>
          {STATUSES.map(status => <NativeSelectOption key={status} value={status}>{STATUS_LABELS[status]}</NativeSelectOption>)}
        </NativeSelect>
      </form>
      {!rows ? <div className="bk-cal-loading"><Busy /></div>
        : <>
          <CalendarView api={api} view={view} days={days} anchor={anchor} rows={rows} prefs={prefs} handlers={handlers} />
          {view === "list" && rows.length === 0 && <p className="bk-muted bk-cal-empty">{customer || statusFilter ? "Nenhum atendimento futuro com esses filtros." : "Nenhum atendimento futuro."}</p>}
        </>}
      {rows && <Legend rows={rows} prefs={prefs} />}
    </div>
    <Customize open={customizing} onOpenChange={setCustomizing} prefs={prefs} onChange={changePrefs} />
    <Dialog open={!!editing} onOpenChange={open => { if (!open && !busy) setEditing(undefined); }}>
      <DialogContent className="bk-editor">
        <DialogHeader><DialogTitle>{current ? "Atendimento" : "Novo atendimento"}</DialogTitle><DialogDescription>{current ? "Veja ou altere os dados." : "Preencha o cliente e o horário."}</DialogDescription></DialogHeader>
        {current && <div className="bk-who">
          {current.created_by_name ? <div><Booker api={api} row={current} className="size-8" /><p><span>Marcado por</span><strong>{current.created_by_name}</strong><small>{new Date(current.created_at.endsWith("Z") ? current.created_at : current.created_at + "Z").toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</small></p></div> : <div><p><span>Marcado por</span><strong>Não informado</strong></p></div>}
          {current.staff_name && <div><Picture shared api={api} path={"/auth/profile/photo?user_id=" + encodeURIComponent(current.staff_user_id!)} name={current.staff_name} hasPhoto={!!current.staff_has_photo} className="size-8" /><p><span>Atende</span><strong>{current.staff_name}</strong></p></div>}
        </div>}
        {editing && <form onSubmit={submit} className="flex flex-col gap-4" key={current?.id || editing.start || "new"}>
        <FieldGroup>
          <TextField label="Nome do cliente" name="customer_name" required maxLength={160} defaultValue={current?.customer_name || ""} />
          <TextField label="Celular do cliente (opcional)" name="customer_phone" type="tel" maxLength={30} defaultValue={current?.customer_phone || ""} />
          {current?.customer_phone && <div className="bk-row">
            <Button type="button" variant="outline" size="sm" asChild><a href={"tel:" + current.customer_phone}><Phone data-icon="inline-start" />Ligar</a></Button>
            <Button type="button" variant="outline" size="sm" asChild><a href={"https://wa.me/" + current.customer_phone.replace(/\D/g, "")} target="_blank" rel="noopener"><MessageCircle data-icon="inline-start" />WhatsApp</a></Button>
          </div>}
          <TextField label="E-mail do cliente (opcional)" name="customer_email" type="email" defaultValue={current?.customer_email || ""} />
          <AppointmentFields current={current} defaultStart={defaultStart} services={services} />
          <Field><FieldLabel htmlFor="bk-staff">Quem atende</FieldLabel>
            <NativeSelect id="bk-staff" name="staff_user_id" required defaultValue={current?.staff_user_id || (members.length === 1 ? members[0].user_id : "")}>
              <NativeSelectOption value="">Escolha quem atende</NativeSelectOption>
              {members.map(member => <NativeSelectOption key={member.user_id} value={member.user_id}>{member.name}</NativeSelectOption>)}
            </NativeSelect><p className="text-sm text-muted-foreground">Obrigatório. A mesma pessoa não pode ter dois agendamentos no mesmo horário; pessoas diferentes podem.</p></Field>
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
      </form>}
    </DialogContent></Dialog>
  </section>;
}
