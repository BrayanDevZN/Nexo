import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Field, FieldLabel, TextField } from "@/admin/shared";
import { FieldDescription } from "@/components/ui/field";
import { formatMoney, isoToLocal, type Appointment, type Service } from "./api";

export const DEFAULT_MINUTES = 30;
const pad = (n: number) => String(n).padStart(2, "0");
const toLocal = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
const money = (value: number) => value.toFixed(2).replace(".", ",");

/** "Agora", to the minute, as the value of a datetime-local field. */
export const nowLocal = () => toLocal(new Date());

/**
 * The service, time and price part of the appointment form. Nothing here is required: the services (one or several) give the
 * duration (their sum, counted from the start, which is now unless changed) and the price (their sum); the person can
 * overwrite either one, and go back to the automatic value. The form reads three hidden fields: service_ids, ends_at and price
 * (the last two only when overwritten, empty means "automatic").
 */
export function AppointmentFields({ current, defaultStart, services }: { current?: Appointment; defaultStart: string; services: Service[] }) {
  const known = useMemo(() => new Map(services.map(service => [service.id, service])), [services]);
  const [ids, setIds] = useState<string[]>(() => current?.service_ids?.length ? current.service_ids : current?.service_id ? [current.service_id] : []);
  const [start, setStart] = useState(defaultStart);
  const chosen = ids.map(id => known.get(id)).filter((service): service is Service => !!service);
  const autoMinutes = chosen.length ? chosen.reduce((sum, service) => sum + service.duration_minutes, 0) : DEFAULT_MINUTES;
  const priced = chosen.filter(service => service.price !== null);
  const autoPrice = priced.length ? priced.reduce((sum, service) => sum + Number(service.price), 0) : null;
  // An existing appointment whose length or price differs from the sum of its services keeps that value as an overwrite.
  const [minutes, setMinutes] = useState<string | null>(() => {
    if (!current) return null;
    const actual = Math.round((new Date(isoToLocal(current.ends_at)).getTime() - new Date(isoToLocal(current.starts_at)).getTime()) / 60000);
    const sum = (current.service_ids?.length ? current.service_ids : current.service_id ? [current.service_id] : []).reduce((total, id) => total + (known.get(id)?.duration_minutes ?? 0), 0);
    return actual === (sum || DEFAULT_MINUTES) ? null : String(actual);
  });
  const [price, setPrice] = useState<string | null>(() => {
    if (!current || current.price === null) return null;
    const sum = (current.service_ids?.length ? current.service_ids : current.service_id ? [current.service_id] : []).map(id => known.get(id)).filter((service): service is Service => !!service && service.price !== null);
    return sum.length && Math.abs(sum.reduce((total, service) => total + Number(service.price), 0) - current.price) < 0.005 ? null : money(current.price);
  });
  const shownMinutes = minutes ?? String(autoMinutes);
  const shownPrice = price ?? (autoPrice === null ? "" : money(autoPrice));
  const totalMinutes = Math.max(1, Number(shownMinutes) || autoMinutes);
  const startDate = start ? new Date(start) : new Date();
  const end = new Date(startDate.getTime() + totalMinutes * 60000);
  const sameDay = end.toDateString() === startDate.toDateString();
  const endText = end.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) + (sameDay ? "" : " de " + end.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }));
  const total = price !== null ? Number(price.replace(",", ".")) : autoPrice;
  return <>
    <Field><FieldLabel>Serviços</FieldLabel>
      {services.length === 0
        ? <FieldDescription>Nenhum serviço cadastrado: o atendimento fica como “Atendimento” de {DEFAULT_MINUTES} minutos. Cadastre serviços na aba Serviços para somar tempo e preço sozinho.</FieldDescription>
        : <ToggleGroup type="multiple" value={ids} onValueChange={setIds} aria-label="Serviços do atendimento" className="bk-pick">
          {services.map(service => <ToggleGroupItem key={service.id} value={service.id}>
            <span>{service.name}</span><small>{service.duration_minutes} min{service.price !== null ? " · " + formatMoney(service.price) : ""}</small>
          </ToggleGroupItem>)}
        </ToggleGroup>}
      <FieldDescription>Escolha um ou mais. O tempo e o preço são a soma dos escolhidos. Opcional.</FieldDescription>
    </Field>
    {chosen.length === 0 && <TextField label="Nome do atendimento" name="service_name" maxLength={160} placeholder="Atendimento" defaultValue={current && !current.service_id && !current.service_ids?.length ? current.service_name : ""} help="Opcional. Sem serviços, usamos “Atendimento”." />}
    <TextField label="Início" name="starts_at" type="datetime-local" value={start} onChange={event => setStart(event.target.value)} help="Já vem com a data e a hora de agora. Mude se for marcar para outro horário." />
    <div className="bk-grid-2">
      <Field><FieldLabel htmlFor="bk-minutes">Duração (minutos)</FieldLabel>
        <input id="bk-minutes" type="number" inputMode="numeric" min={1} max={1440} value={shownMinutes} onChange={event => setMinutes(event.target.value)} />
        <FieldDescription>{minutes === null ? (chosen.length ? `Soma dos serviços: ${autoMinutes} min.` : `Sem serviços: ${DEFAULT_MINUTES} min.`) : <>Alterada à mão. <button type="button" className="bk-auto" onClick={() => setMinutes(null)}><RotateCcw />Voltar ao automático ({autoMinutes} min)</button></>}</FieldDescription>
      </Field>
      <Field><FieldLabel htmlFor="bk-price">Preço (R$)</FieldLabel>
        <input id="bk-price" inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" placeholder="Sem preço" value={shownPrice} onChange={event => setPrice(event.target.value)} />
        <FieldDescription>{price === null ? (priced.length ? `Soma dos serviços${priced.length < chosen.length ? " com preço" : ""}.` : "Sem preço nos serviços escolhidos.") : <>Alterado à mão. <button type="button" className="bk-auto" onClick={() => setPrice(null)}><RotateCcw />Voltar ao automático{autoPrice !== null ? ` (R$ ${money(autoPrice)})` : ""}</button></>}</FieldDescription>
      </Field>
    </div>
    <p className="bk-total" aria-live="polite"><span>{totalMinutes} min</span><span>termina às {endText}</span><strong>{total !== null && Number.isFinite(total) ? formatMoney(total) : "Sem preço"}</strong></p>
    <input type="hidden" name="service_ids" value={JSON.stringify(ids)} />
    <input type="hidden" name="ends_at" value={minutes === null ? "" : toLocal(end)} />
    <input type="hidden" name="price" value={price === null ? "" : price} />
  </>;
}
