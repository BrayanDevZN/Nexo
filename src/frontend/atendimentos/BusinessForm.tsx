import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Busy, Feedback, Field, FieldGroup, FieldLabel, TextField, message } from "@/admin/shared";
import { WEEKDAYS, WEEKDAY_LABELS, type BookingApi, type Business, type OpeningHours, type Weekday } from "./api";
import { PhotoField, preparePhoto } from "./Photo";

const EMPTY_HOURS = (): OpeningHours => ({ mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] });

const formatCnpj = (value: string | null) => (value || "").replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

/** The photo of a business that does not exist yet: it is chosen here and sent right after the business is created. */
function NewPhoto({ file, onChange, disabled }: { file?: File; onChange: (file?: File) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function pick(picked?: File) {
    if (!picked) return;
    setError("");
    try { onChange(await preparePhoto(picked)); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível usar essa foto."); }
    finally { if (input.current) input.current.value = ""; }
  }
  return <Field data-invalid={!!error || undefined}>
    <FieldLabel>Logo ou foto do negócio <span className="font-normal text-muted-foreground">(opcional)</span></FieldLabel>
    <div className="bk-photo">
      {preview
        ? <img src={preview} alt="Prévia da foto do negócio" className="size-16 rounded-full object-cover" />
        : <span className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden="true"><Camera /></span>}
      <div className="bk-photo-actions">
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => input.current?.click()}><Camera data-icon="inline-start" />{file ? "Trocar foto" : "Escolher foto"}</Button>
        {file && <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(undefined)}><Trash2 data-icon="inline-start" />Remover</Button>}
      </div>
    </div>
    <input ref={input} type="file" className="sr-only" accept="image/*" disabled={disabled} onChange={event => void pick(event.target.files?.[0])} />
    <p className={error ? "text-sm text-destructive" : "bk-muted"} role={error ? "alert" : undefined}>{error || "Qualquer foto do celular serve; ela é redimensionada."}</p>
  </Field>;
}

/** Creates a business or edits its profile and opening hours. Hours are plain time inputs, one line per interval. */
export function BusinessForm({ api, business, onSaved, onDeleted, canDelete }: {
  api: BookingApi; business?: Business; onSaved: (business: Business) => void; onDeleted?: () => void; canDelete?: boolean;
}) {
  const [hours, setHours] = useState<OpeningHours>(() => business ? { ...EMPTY_HOURS(), ...business.opening_hours } : EMPTY_HOURS());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newPhoto, setNewPhoto] = useState<File>();
  function setSlot(day: Weekday, index: number, position: 0 | 1, value: string) {
    setHours(current => ({ ...current, [day]: current[day].map((slot, i) => i === index ? (position === 0 ? [value, slot[1]] : [slot[0], value]) as [string, string] : slot) }));
  }
  function addSlot(day: Weekday) { setHours(current => ({ ...current, [day]: [...current[day], ["09:00", "18:00"]] })); }
  function removeSlot(day: Weekday, index: number) { setHours(current => ({ ...current, [day]: current[day].filter((_, i) => i !== index) })); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    const body = {
      name: values.name, cnpj: values.cnpj?.trim() || null, description: values.description || null, phone: values.phone || null, email: values.email || null,
      address: values.address || null, city: values.city || null, state: values.state || null, opening_hours: hours,
    };
    setBusy(true); setError(""); setSuccess("");
    try {
      let saved = business
        ? await api.mutate<Business>("/businesses/" + business.id, "PATCH", body)
        : await api.mutate<Business>("/businesses", "POST", body);
      if (!business && newPhoto) {
        // The business exists now; a failed photo must not undo it, it can be added again from the business data.
        const data = new FormData(); data.set("file", newPhoto);
        try { saved = await api.mutate<Business>("/businesses/" + saved.id + "/photo", "PUT", data); } catch { /* keep the business */ }
      }
      onSaved(saved);
      if (business) setSuccess("Dados salvos.");
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  async function remove() {
    if (!business || busy) return;
    setBusy(true); setError("");
    try { await api.mutate("/businesses/" + business.id, "DELETE"); onDeleted?.(); }
    catch (e) { setError(message(e)); setBusy(false); }
  }
  return <Card>
    <CardHeader><CardTitle>{business ? "Dados do negócio" : "Novo negócio"}</CardTitle>
      <CardDescription>{business ? "O que a equipe e os clientes veem." : "Comece pelo nome. O resto pode ser preenchido depois."}</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-4">
      <Feedback error={error} success={success} />
      {business && <PhotoField api={api} path={"/businesses/" + business.id + "/photo"} name={business.name} hasPhoto={business.has_photo} disabled={busy} onChanged={hasPhoto => onSaved({ ...business, has_photo: hasPhoto })} label="Logo ou foto do negócio" />}
      {!business && <NewPhoto file={newPhoto} onChange={setNewPhoto} disabled={busy} />}
      <form onSubmit={submit} className="flex flex-col gap-4">
        <FieldGroup>
          <TextField label="Nome do negócio" name="name" required maxLength={160} defaultValue={business?.name || ""} />
          <div className="bk-grid-2">
            <TextField label="CNPJ (opcional)" name="cnpj" inputMode="numeric" maxLength={18} placeholder="00.000.000/0000-00" defaultValue={formatCnpj(business?.cnpj ?? null)} help="Deixe em branco se o negócio não tiver CNPJ." />
            <TextField label="Telefone ou WhatsApp" name="phone" type="tel" maxLength={30} defaultValue={business?.phone || ""} />
          </div>
          <div className="bk-grid-2">
            <TextField label="E-mail" name="email" type="email" defaultValue={business?.email || ""} />
            <TextField label="Endereço" name="address" maxLength={300} defaultValue={business?.address || ""} />
          </div>
          <div className="bk-grid-2">
            <TextField label="Cidade" name="city" maxLength={120} defaultValue={business?.city || ""} />
            <TextField label="UF" name="state" maxLength={2} pattern="[A-Za-z]{2}" defaultValue={business?.state || ""} />
          </div>
          <Field><FieldLabel htmlFor="bk-description">Descrição</FieldLabel><Textarea id="bk-description" name="description" maxLength={2000} defaultValue={business?.description || ""} /></Field>
        </FieldGroup>
        <div className="flex flex-col gap-2">
          <h2>Horário de funcionamento</h2>
          <p className="bk-muted">Deixe o dia sem horário para marcar como fechado.</p>
          <div className="bk-hours">
            {WEEKDAYS.map(day => <div className="bk-hours-day" key={day}>
              <label>{WEEKDAY_LABELS[day]}</label>
              <div className="bk-hours-slots">
                {hours[day].length === 0 && <span className="bk-muted" style={{ paddingTop: "0.7rem" }}>Fechado</span>}
                {hours[day].map((slot, index) => <div className="bk-hours-slot" key={index}>
                  <input type="time" aria-label={`${WEEKDAY_LABELS[day]}, início`} value={slot[0]} onChange={e => setSlot(day, index, 0, e.target.value)} required />
                  <span>às</span>
                  <input type="time" aria-label={`${WEEKDAY_LABELS[day]}, fim`} value={slot[1]} onChange={e => setSlot(day, index, 1, e.target.value)} required />
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeSlot(day, index)} aria-label={`Remover horário de ${WEEKDAY_LABELS[day]}`}><X /></Button>
                </div>)}
                {hours[day].length < 4 && <Button type="button" variant="link" size="sm" className="self-start" onClick={() => addSlot(day)}>+ horário</Button>}
              </div>
            </div>)}
          </div>
        </div>
        <Button type="submit" size="lg" className="self-start" disabled={busy}>{busy ? <Busy>Salvando…</Busy> : business ? "Salvar alterações" : "Criar negócio"}</Button>
      </form>
      {business && canDelete && <div className="flex flex-col gap-2 border-t pt-4">
        {!confirmDelete ? <Button variant="destructive" disabled={busy} onClick={() => setConfirmDelete(true)}>Excluir este negócio</Button>
          : <><p className="bk-muted">Isso apaga serviços, equipe e todos os atendimentos de {business.name}. Não dá para desfazer.</p>
            <div className="bk-row"><Button variant="destructive" disabled={busy} onClick={remove}>Sim, excluir tudo</Button><Button variant="outline" disabled={busy} onClick={() => setConfirmDelete(false)}>Cancelar</Button></div></>}
      </div>}
    </CardContent>
  </Card>;
}
