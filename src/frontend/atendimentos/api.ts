import { apiBase, createApi } from "@/admin/api";

/** The scheduling product talks to the same backend under /atendimentos, with its own session cookie. */
export function createBookingApi() {
  return createApi(apiBase(import.meta.env.PROD ? "/api" : (import.meta.env.VITE_API_URL || "")) + "/atendimentos");
}
export type BookingApi = ReturnType<typeof createBookingApi>;

export type BookingUser = { id: string; name: string; email: string; phone: string | null };
export type BusinessRole = "owner" | "manager" | "staff" | "viewer";
export type InvitableRole = Exclude<BusinessRole, "owner">;
export const ROLE_LABELS: Record<BusinessRole, string> = { owner: "Dono", manager: "Gerente", staff: "Atendente", viewer: "Só leitura" };
export const ROLE_HELP: Record<InvitableRole, string> = {
  manager: "Edita o negócio, os serviços, a equipe e a agenda.",
  staff: "Marca e altera atendimentos. Não exclui.",
  viewer: "Só vê a agenda e os dados.",
};
export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = typeof WEEKDAYS[number];
export const WEEKDAY_LABELS: Record<Weekday, string> = { mon: "Segunda", tue: "Terça", wed: "Quarta", thu: "Quinta", fri: "Sexta", sat: "Sábado", sun: "Domingo" };
export type OpeningHours = Record<Weekday, [string, string][]>;
export type Business = {
  id: string; owner_id: string; name: string; slug: string; description: string | null; phone: string | null;
  email: string | null; address: string | null; city: string | null; state: string | null; timezone: string;
  opening_hours: OpeningHours; my_role: BusinessRole; created_at: string; updated_at: string;
};
export type Member = { id: string; business_id: string; user_id: string; role: BusinessRole; name: string | null; email: string | null; created_at: string };
export type Invitation = { id: string; business_id: string; email: string | null; role: InvitableRole; created_by_id: string; expires_at: string; created_at: string; url?: string | null };
export type InvitationInfo = { business_name: string; role: InvitableRole; email: string | null; expires_at: string };
export type Service = { id: string; business_id: string; name: string; description: string | null; duration_minutes: number; price: number | null; active: boolean; created_at: string; updated_at: string };
export type AppointmentStatus = "scheduled" | "confirmed" | "done" | "cancelled" | "no_show";
export const STATUS_LABELS: Record<AppointmentStatus, string> = { scheduled: "Marcado", confirmed: "Confirmado", done: "Concluído", cancelled: "Cancelado", no_show: "Não veio" };
export type Appointment = {
  id: string; business_id: string; service_id: string | null; service_name: string; staff_user_id: string | null;
  staff_name: string | null; customer_name: string; customer_phone: string | null; customer_email: string | null;
  starts_at: string; ends_at: string; status: AppointmentStatus; price: number | null; notes: string | null;
  created_by_id: string | null; created_at: string; updated_at: string;
};
export type Overview = { today: number; next_7_days: number; upcoming: number; finished: number; by_status: Record<AppointmentStatus, number>; next: Appointment[] };

/** What each role may do; the server is the authority, this only hides buttons that would fail. */
export const can = {
  editBusiness: (role: BusinessRole) => role === "owner" || role === "manager",
  deleteBusiness: (role: BusinessRole) => role === "owner",
  manageTeam: (role: BusinessRole) => role === "owner" || role === "manager",
  editServices: (role: BusinessRole) => role === "owner" || role === "manager",
  writeAppointments: (role: BusinessRole) => role !== "viewer",
  deleteAppointments: (role: BusinessRole) => role === "owner" || role === "manager",
};
const RANK: Record<BusinessRole, number> = { owner: 3, manager: 2, staff: 1, viewer: 0 };
export const outranks = (role: BusinessRole, other: BusinessRole) => RANK[role] > RANK[other];

/** Server timestamps are UTC with a trailing Z; the phone shows them in its own time zone. */
export const asDate = (value: string) => new Date(value.endsWith("Z") ? value : value + "Z");
export const formatTime = (value: string) => asDate(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
export const formatDate = (value: string) => asDate(value).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
export const formatMoney = (value: number | null) => value === null ? "" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
/** "2026-12-01" in the phone's time zone, for the day picker and the list filters. */
export function dayKey(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export function dayBounds(key: string) {
  const start = new Date(key + "T00:00:00");
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return { starts_from: start.toISOString(), starts_until: end.toISOString() };
}
/** The value of a datetime-local input, in the phone's time zone, as the ISO instant the API expects. */
export const localToIso = (value: string) => new Date(value).toISOString();
export function isoToLocal(value: string) {
  const date = asDate(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dayKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
