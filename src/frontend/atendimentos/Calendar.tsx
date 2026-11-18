import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { asDate, dayKey, formatTime, STATUS_LABELS, type Appointment, type AppointmentStatus, type BookingApi } from "./api";
import { Picture } from "./Photo";
import {
  dayLong, defaultPrefs, eventColor, HOUR_HEIGHT, placeEvents, sameDay, startOfDay, STATUS_COLORS, weekdayShort,
  type CalendarPrefs, type CalendarView, type Density,
} from "./calendarPrefs";

type Handlers = { onEvent: (row: Appointment) => void; onSlot: (start: string) => void; onDay: (day: Date) => void };
const pad = (n: number) => String(n).padStart(2, "0");
const hourLabel = (hour: number) => pad(hour) + ":00";
const title = (row: Appointment) => `${formatTime(row.starts_at)} – ${formatTime(row.ends_at)} · ${row.customer_name} · ${row.service_name} · ${STATUS_LABELS[row.status]}${row.staff_name ? " · Atende: " + row.staff_name : ""}${row.created_by_name ? " · Marcado por " + row.created_by_name : ""}`;

/** Who booked the appointment, as their photo (or initials). Nothing is drawn when nobody is recorded: it is optional. */
export function Booker({ api, row, className = "size-4" }: { api: BookingApi; row: Appointment; className?: string }) {
  if (!row.created_by_id || !row.created_by_name) return null;
  return <Picture shared api={api} path={"/auth/profile/photo?user_id=" + encodeURIComponent(row.created_by_id)} name={row.created_by_name} hasPhoto={!!row.created_by_has_photo} className={className} />;
}
const byDay = (rows: Appointment[]) => {
  const map = new Map<string, Appointment[]>();
  for (const row of rows) { const key = dayKey(asDate(row.starts_at)); map.set(key, [...(map.get(key) || []), row]); }
  return map;
};

/** One appointment as a coloured block, the way Google Calendar draws events. */
function Event({ api, row, prefs, onEvent, style, compact }: { api: BookingApi; row: Appointment; prefs: CalendarPrefs; onEvent: Handlers["onEvent"]; style?: React.CSSProperties; compact?: boolean }) {
  const color = eventColor(row, prefs);
  const closed = row.status === "cancelled" || row.status === "no_show";
  return <button type="button" className="bk-event" data-closed={closed || undefined} data-status={row.status} data-compact={compact || undefined} title={title(row)} aria-label={title(row)}
    style={{ ...style, "--ev": color } as React.CSSProperties} onClick={event => { event.stopPropagation(); onEvent(row); }}>
    <strong>{row.customer_name}</strong>
    <span>{formatTime(row.starts_at)} · {row.service_name}</span>
    {row.created_by_name && <i className="bk-by" aria-hidden="true"><Booker api={api} row={row} /></i>}
  </button>;
}

/** Day and week: hours down the side, one column per day, events placed by time. Click an empty spot to book it. */
function TimeGrid({ api, days, rows, prefs, handlers }: { api: BookingApi; days: Date[]; rows: Appointment[]; prefs: CalendarPrefs; handlers: Handlers }) {
  const grouped = useMemo(() => byDay(rows), [rows]);
  // Never hide an appointment: widen the visible hours to include every one that was loaded.
  const [start, end] = useMemo(() => {
    let from = prefs.dayStart, to = prefs.dayEnd;
    for (const row of rows) {
      const s = asDate(row.starts_at), e = asDate(row.ends_at);
      from = Math.min(from, s.getHours());
      to = Math.max(to, sameDay(s, e) ? Math.ceil((e.getHours() * 60 + e.getMinutes()) / 60) : 24);
    }
    return [from, Math.min(24, to)];
  }, [rows, prefs.dayStart, prefs.dayEnd]);
  const hourHeight = HOUR_HEIGHT[prefs.density];
  const hours = Array.from({ length: end - start }, (_, i) => start + i);
  const scroller = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 60000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    // Open near the working day instead of at the top of an empty morning: first event of the range, or now.
    const el = scroller.current;
    if (!el) return;
    const first = rows.length ? Math.min(...rows.map(row => asDate(row.starts_at).getHours())) : Math.max(start, now.getHours() - 1);
    el.scrollTop = Math.max(0, (first - start - 0.5) * hourHeight);
  }, [days[0]?.getTime(), days.length, hourHeight]); // eslint-disable-line react-hooks/exhaustive-deps
  const today = startOfDay(now);
  const nowTop = ((now.getHours() - start) * 60 + now.getMinutes()) / 60 * hourHeight;
  function pick(day: Date, event: React.MouseEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const minutes = Math.floor(((event.clientY - box.top) / hourHeight * 60) / 30) * 30 + start * 60;
    handlers.onSlot(`${dayKey(day)}T${pad(Math.min(23, Math.floor(minutes / 60)))}:${pad(minutes % 60)}`);
  }
  return <div className="bk-grid-scroll" ref={scroller}>
    <div className="bk-tg" style={{ "--cols": days.length, "--hh": hourHeight + "px" } as React.CSSProperties}>
      <div className="bk-tg-head">
        <div className="bk-tg-corner" />
        {days.map(day => <button type="button" key={day.getTime()} className="bk-tg-day" data-today={sameDay(day, today) || undefined} onClick={() => handlers.onDay(day)} aria-label={dayLong(day)}>
          <small>{weekdayShort(day)}</small><b>{day.getDate()}</b>
        </button>)}
      </div>
      <div className="bk-tg-body" style={{ height: hours.length * hourHeight }}>
        <div className="bk-tg-hours">{hours.map((hour, i) => <span key={hour} style={{ top: i * hourHeight }}>{i === 0 ? "" : hourLabel(hour)}</span>)}</div>
        {days.map(day => {
          const placed = placeEvents(grouped.get(dayKey(day)) || [], start * 60);
          const isToday = sameDay(day, today);
          return <div className="bk-tg-col" key={day.getTime()} data-today={isToday || undefined} onClick={event => pick(day, event)}>
            {placed.map(({ row, top, height, column, columns }) => <Event key={row.id} api={api} row={row} prefs={prefs} onEvent={handlers.onEvent} compact={height / 60 * hourHeight < 38}
              style={{ top: top / 60 * hourHeight, height: Math.max(18, height / 60 * hourHeight - 2), left: `calc(${column / columns * 100}% + 1px)`, width: `calc(${100 / columns}% - 3px)` }} />)}
            {isToday && nowTop >= 0 && nowTop <= hours.length * hourHeight && <div className="bk-now" style={{ top: nowTop }} aria-hidden="true" />}
          </div>;
        })}
      </div>
    </div>
  </div>;
}

/** Month: a grid of days with the first few appointments of each as small chips. */
function MonthGrid({ days, anchor, rows, prefs, handlers }: { days: Date[]; anchor: Date; rows: Appointment[]; prefs: CalendarPrefs; handlers: Handlers }) {
  const grouped = useMemo(() => byDay(rows), [rows]);
  const today = startOfDay(new Date());
  const heads = days.slice(0, prefs.showWeekends ? 7 : 5);
  return <div className="bk-month" style={{ "--cols": heads.length } as React.CSSProperties}>
    {heads.map(day => <div className="bk-month-head" key={day.getTime()}>{weekdayShort(day)}</div>)}
    {days.map(day => {
      const list = (grouped.get(dayKey(day)) || []).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
      const shown = list.slice(0, 3);
      return <div className="bk-month-cell" key={day.getTime()} data-outside={day.getMonth() !== anchor.getMonth() || undefined} data-today={sameDay(day, today) || undefined}
        onClick={() => handlers.onDay(day)}>
        <button type="button" className="bk-month-num" aria-label={dayLong(day) + (list.length ? `, ${list.length} atendimentos` : "")} onClick={event => { event.stopPropagation(); handlers.onDay(day); }}>{day.getDate()}</button>
        <div className="bk-chips">
          {shown.map(row => <button type="button" className="bk-chip" key={row.id} title={title(row)} aria-label={title(row)} data-closed={row.status === "cancelled" || row.status === "no_show" || undefined}
            style={{ "--ev": eventColor(row, prefs) } as React.CSSProperties} onClick={event => { event.stopPropagation(); handlers.onEvent(row); }}>
            <i aria-hidden="true" /><span>{formatTime(row.starts_at)} {row.customer_name}</span>
          </button>)}
          {list.length > shown.length && <button type="button" className="bk-more" onClick={event => { event.stopPropagation(); handlers.onDay(day); }}>+{list.length - shown.length} mais</button>}
        </div>
      </div>;
    })}
  </div>;
}

/** The schedule list: upcoming appointments grouped by day. */
function ListView({ api, rows, prefs, handlers }: { api: BookingApi; rows: Appointment[]; prefs: CalendarPrefs; handlers: Handlers }) {
  const groups = useMemo(() => [...byDay(rows)].sort(([a], [b]) => a.localeCompare(b)), [rows]);
  return <div className="bk-sched">
    {groups.map(([key, list]) => {
      const day = new Date(key + "T00:00:00");
      return <section key={key} className="bk-sched-day">
        <button type="button" className="bk-sched-date" data-today={sameDay(day, new Date()) || undefined} onClick={() => handlers.onDay(day)}><b>{day.getDate()}</b><small>{weekdayShort(day)}</small></button>
        <div className="bk-sched-rows">{list.sort((a, b) => a.starts_at.localeCompare(b.starts_at)).map(row => <button type="button" className="bk-sched-row" key={row.id} data-closed={row.status === "cancelled" || row.status === "no_show" || undefined}
          style={{ "--ev": eventColor(row, prefs) } as React.CSSProperties} onClick={() => handlers.onEvent(row)}>
          <i aria-hidden="true" /><time>{formatTime(row.starts_at)} – {formatTime(row.ends_at)}</time>
          <span><strong>{row.customer_name}</strong> · {row.service_name}{row.staff_name ? " · Atende: " + row.staff_name : ""}</span>
          <b className="bk-by-line">{row.created_by_name ? <><Booker api={api} row={row} className="size-5" />{row.created_by_name.split(" ")[0]}</> : null}</b>
          <em>{STATUS_LABELS[row.status]}</em>
        </button>)}</div>
      </section>;
    })}
  </div>;
}

export function CalendarView({ api, view, days, anchor, rows, prefs, handlers }: { api: BookingApi; view: CalendarView; days: Date[]; anchor: Date; rows: Appointment[]; prefs: CalendarPrefs; handlers: Handlers }) {
  const visible = prefs.showCancelled ? rows : rows.filter(row => row.status !== "cancelled" && row.status !== "no_show");
  if (view === "month") return <MonthGrid days={days} anchor={anchor} rows={visible} prefs={prefs} handlers={handlers} />;
  if (view === "list") return <ListView api={api} rows={visible} prefs={prefs} handlers={handlers} />;
  return <TimeGrid api={api} days={days} rows={visible} prefs={prefs} handlers={handlers} />;
}

/** Colour key for the current "colour by" choice, like the legend under Google Calendar's sidebar. */
export function Legend({ rows, prefs }: { rows: Appointment[]; prefs: CalendarPrefs }) {
  const items = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows) {
      const label = prefs.colorBy === "status" ? STATUS_LABELS[row.status] : prefs.colorBy === "service" ? row.service_name : row.staff_name || "Sem responsável";
      if (!seen.has(label)) seen.set(label, eventColor(row, prefs));
    }
    return [...seen];
  }, [rows, prefs]);
  if (!items.length) return null;
  return <ul className="bk-legend" aria-label="Cores">{items.map(([label, color]) => <li key={label}><i style={{ background: color }} aria-hidden="true" />{label}</li>)}</ul>;
}

const HOURS = Array.from({ length: 25 }, (_, i) => i);
const STATUS_ORDER: AppointmentStatus[] = ["scheduled", "confirmed", "done", "cancelled", "no_show"];

/** The "Personalizar" dialog: every change applies at once and is remembered in this browser. */
export function Customize({ open, onOpenChange, prefs, onChange }: { open: boolean; onOpenChange: (open: boolean) => void; prefs: CalendarPrefs; onChange: (prefs: CalendarPrefs) => void }) {
  const set = <K extends keyof CalendarPrefs>(name: K, value: CalendarPrefs[K]) => onChange({ ...prefs, [name]: value });
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="bk-customize">
      <DialogHeader><DialogTitle>Personalizar agenda</DialogTitle><DialogDescription>As mudanças valem na hora e ficam salvas neste aparelho.</DialogDescription></DialogHeader>
      <div className="bk-set">
        <label>Visão inicial<NativeSelect value={prefs.view} onChange={e => set("view", e.target.value as CalendarView)}>
          <NativeSelectOption value="day">Dia</NativeSelectOption><NativeSelectOption value="week">Semana</NativeSelectOption>
          <NativeSelectOption value="month">Mês</NativeSelectOption><NativeSelectOption value="list">Lista</NativeSelectOption></NativeSelect></label>
        <label>A semana começa na<NativeSelect value={String(prefs.firstDay)} onChange={e => set("firstDay", e.target.value === "1" ? 1 : 0)}>
          <NativeSelectOption value="0">Domingo</NativeSelectOption><NativeSelectOption value="1">Segunda-feira</NativeSelectOption></NativeSelect></label>
        <label>Colorir por<NativeSelect value={prefs.colorBy} onChange={e => set("colorBy", e.target.value as CalendarPrefs["colorBy"])}>
          <NativeSelectOption value="status">Situação</NativeSelectOption><NativeSelectOption value="service">Serviço</NativeSelectOption>
          <NativeSelectOption value="staff">Quem atende</NativeSelectOption></NativeSelect></label>
        <label>Tamanho das horas<NativeSelect value={prefs.density} onChange={e => set("density", e.target.value as Density)}>
          <NativeSelectOption value="compact">Compacto</NativeSelectOption><NativeSelectOption value="normal">Normal</NativeSelectOption>
          <NativeSelectOption value="comfortable">Confortável</NativeSelectOption></NativeSelect></label>
        <label>Mostrar a partir das<NativeSelect value={String(prefs.dayStart)} onChange={e => { const v = Number(e.target.value); onChange({ ...prefs, dayStart: v, dayEnd: Math.max(prefs.dayEnd, v + 1) }); }}>
          {HOURS.slice(0, 24).map(h => <NativeSelectOption key={h} value={String(h)}>{hourLabel(h)}</NativeSelectOption>)}</NativeSelect></label>
        <label>Até as<NativeSelect value={String(prefs.dayEnd)} onChange={e => { const v = Number(e.target.value); onChange({ ...prefs, dayEnd: v, dayStart: Math.min(prefs.dayStart, v - 1) }); }}>
          {HOURS.slice(1).map(h => <NativeSelectOption key={h} value={String(h)}>{hourLabel(h)}</NativeSelectOption>)}</NativeSelect></label>
      </div>
      <div className="bk-switch"><span>Mostrar fins de semana</span><Switch checked={prefs.showWeekends} onCheckedChange={value => set("showWeekends", value)} aria-label="Mostrar fins de semana" /></div>
      <div className="bk-switch"><span>Mostrar cancelados e faltas</span><Switch checked={prefs.showCancelled} onCheckedChange={value => set("showCancelled", value)} aria-label="Mostrar cancelados e faltas" /></div>
      <div className="flex flex-col gap-2">
        <h2>Cores das situações</h2>
        <p className="bk-muted">Valem quando a agenda é colorida por situação.</p>
        <div className="bk-colors">{STATUS_ORDER.map(status => <label key={status}><span className="bk-swatch" style={{ background: prefs.statusColors[status] }}><input type="color" value={prefs.statusColors[status]} onChange={e => set("statusColors", { ...prefs.statusColors, [status]: e.target.value })} aria-label={"Cor de " + STATUS_LABELS[status]} /></span>{STATUS_LABELS[status]}</label>)}</div>
      </div>
      <Button type="button" variant="outline" onClick={() => onChange({ ...defaultPrefs(), statusColors: { ...STATUS_COLORS } })}><RotateCcw data-icon="inline-start" />Restaurar padrão</Button>
    </DialogContent>
  </Dialog>;
}

