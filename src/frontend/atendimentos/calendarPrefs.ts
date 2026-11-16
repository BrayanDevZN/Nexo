import { asDate, dayKey, type Appointment, type AppointmentStatus } from "./api";

export type CalendarView = "day" | "week" | "month" | "list";
export type ColorBy = "status" | "service" | "staff";
export type Density = "compact" | "normal" | "comfortable";

/** What the person can change about how the calendar looks. Kept in this browser, per business. */
export type CalendarPrefs = {
  view: CalendarView;
  colorBy: ColorBy;
  firstDay: 0 | 1;           // 0 = Sunday (like Google Calendar in Brazil), 1 = Monday
  showWeekends: boolean;
  showCancelled: boolean;
  dayStart: number;          // first hour shown in the day/week grid
  dayEnd: number;            // last hour shown (exclusive)
  density: Density;
  statusColors: Record<AppointmentStatus, string>;
};

export const STATUS_COLORS: Record<AppointmentStatus, string> = {
  scheduled: "#7c3aed", confirmed: "#0b8043", done: "#616161", cancelled: "#d50000", no_show: "#e67c73",
};
/** Google Calendar's event colours, used to tell services or people apart. */
export const PALETTE = ["#7986cb", "#33b679", "#8e24aa", "#e67c73", "#f6bf26", "#f4511e", "#039be5", "#616161", "#3f51b5", "#0b8043", "#d50000"];
export const HOUR_HEIGHT: Record<Density, number> = { compact: 40, normal: 56, comfortable: 76 };

export const defaultPrefs = (): CalendarPrefs => ({
  view: typeof window !== "undefined" && window.matchMedia("(max-width: 699px)").matches ? "day" : "week",
  colorBy: "status", firstDay: 0, showWeekends: true, showCancelled: true, dayStart: 7, dayEnd: 21, density: "normal",
  statusColors: { ...STATUS_COLORS },
});

const key = (businessId: string) => "nexo-atendimentos-calendar:" + businessId;

export function loadPrefs(businessId: string): CalendarPrefs {
  const base = defaultPrefs();
  try {
    const saved = JSON.parse(localStorage.getItem(key(businessId)) || "null");
    if (saved && typeof saved === "object") {
      const merged = { ...base, ...saved, statusColors: { ...base.statusColors, ...(saved.statusColors || {}) } } as CalendarPrefs;
      if (!(merged.dayEnd > merged.dayStart)) { merged.dayStart = base.dayStart; merged.dayEnd = base.dayEnd; }
      return merged;
    }
  } catch { /* private mode or corrupted value: use the defaults */ }
  return base;
}

export function savePrefs(businessId: string, prefs: CalendarPrefs) {
  try { localStorage.setItem(key(businessId), JSON.stringify(prefs)); } catch { /* not persisted, still applied */ }
}

// Dates ----------------------------------------------------------------------------------------------------

export const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
export function addDays(date: Date, days: number) { const copy = new Date(date); copy.setDate(copy.getDate() + days); return copy; }
export const fromKey = (value: string) => new Date(value + "T00:00:00");
export function startOfWeek(date: Date, firstDay: 0 | 1) {
  const start = startOfDay(date);
  return addDays(start, -((start.getDay() - firstDay + 7) % 7));
}
export const sameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b);
const cap = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
export const monthTitle = (date: Date) => cap(date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }));
export const weekdayShort = (date: Date) => date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "").toUpperCase();
export const dayLong = (date: Date) => cap(date.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }));

/** The days a view shows. Month is always whole weeks (5 or 6 rows) so the grid keeps its shape. */
export function visibleDays(view: CalendarView, anchor: Date, prefs: CalendarPrefs): Date[] {
  if (view === "day") return [startOfDay(anchor)];
  if (view === "week") {
    const start = startOfWeek(anchor, prefs.firstDay);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i)).filter(day => prefs.showWeekends || (day.getDay() !== 0 && day.getDay() !== 6));
  }
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = startOfWeek(first, prefs.firstDay);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const rows = Math.ceil(((last.getTime() - start.getTime()) / 86400000 + 1) / 7);
  return Array.from({ length: rows * 7 }, (_, i) => addDays(start, i)).filter(day => prefs.showWeekends || (day.getDay() !== 0 && day.getDay() !== 6));
}

/** The server range that covers a view: [from, until). */
export function viewRange(view: CalendarView, anchor: Date, prefs: CalendarPrefs) {
  if (view === "list") return { from: new Date(), until: null as Date | null };
  const full = view === "day" ? [startOfDay(anchor)] : view === "week"
    ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor, prefs.firstDay), i))
    : visibleDays("month", anchor, { ...prefs, showWeekends: true });
  return { from: full[0], until: addDays(full[full.length - 1], 1) };
}

export function shiftAnchor(view: CalendarView, anchor: Date, direction: -1 | 1) {
  if (view === "day") return addDays(anchor, direction);
  if (view === "week") return addDays(anchor, 7 * direction);
  if (view === "month") return new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
  return anchor;
}

export function viewTitle(view: CalendarView, anchor: Date, days: Date[]) {
  if (view === "month") return monthTitle(anchor);
  if (view === "list") return "Próximos atendimentos";
  if (view === "day") return dayLong(anchor);
  const first = days[0], last = days[days.length - 1];
  const month = (d: Date) => d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  return first.getMonth() === last.getMonth()
    ? `${first.getDate()} – ${last.getDate()} de ${month(last)} ${last.getFullYear()}`
    : `${first.getDate()} ${month(first)} – ${last.getDate()} ${month(last)} ${last.getFullYear()}`;
}

// Colours --------------------------------------------------------------------------------------------------

/** The same service or person always gets the same colour, whatever the order they appear in. */
function hashColor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
export function eventColor(row: Appointment, prefs: CalendarPrefs) {
  if (prefs.colorBy === "service") return hashColor(row.service_id || row.service_name);
  if (prefs.colorBy === "staff") return row.staff_user_id ? hashColor(row.staff_user_id) : "#9aa0a6";
  return prefs.statusColors[row.status];
}

// Layout of overlapping events in a day column --------------------------------------------------------------

export type Placed = { row: Appointment; top: number; height: number; column: number; columns: number };

/** Google-style: events that overlap share the column width side by side. `top`/`height` are in minutes from `origin`. */
export function placeEvents(rows: Appointment[], origin: number): Placed[] {
  const items = rows.map(row => {
    const start = asDate(row.starts_at), end = asDate(row.ends_at);
    const from = start.getHours() * 60 + start.getMinutes();
    // Short appointments keep a minimum height so they stay readable; ones that cross midnight stop at 24:00.
    const to = sameDay(start, end) ? Math.max(from + 20, end.getHours() * 60 + end.getMinutes()) : 24 * 60;
    return { row, from, to };
  }).sort((a, b) => a.from - b.from || b.to - a.to);
  const placed: Placed[] = [];
  let cluster: { item: typeof items[number]; column: number }[] = [];
  let clusterEnd = 0;
  const columnEnds: number[] = [];
  const flush = () => {
    const columns = Math.max(1, ...cluster.map(entry => entry.column + 1));
    for (const { item, column } of cluster) placed.push({ row: item.row, top: item.from - origin, height: item.to - item.from, column, columns });
    cluster = []; columnEnds.length = 0; clusterEnd = 0;
  };
  for (const item of items) {
    if (cluster.length && item.from >= clusterEnd) flush();
    let column = columnEnds.findIndex(end => end <= item.from);
    if (column === -1) column = columnEnds.length;
    columnEnds[column] = item.to;
    cluster.push({ item, column });
    clusterEnd = Math.max(clusterEnd, item.to);
  }
  if (cluster.length) flush();
  return placed;
}
