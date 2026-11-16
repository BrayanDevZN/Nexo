import { useEffect, useId, useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import type { BookingApi } from "./api";

export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("");

/** A private photo (served only to signed-in teammates) fetched as a blob and shown in an Avatar, with initials behind. */
export function Picture({ api, path, name, version = 0, hasPhoto, className }: {
  api: BookingApi; path: string; name: string; version?: number; hasPhoto: boolean; className?: string;
}) {
  const [source, setSource] = useState("");
  useEffect(() => {
    if (!hasPhoto) { setSource(""); return; }
    let active = true;
    let url = "";
    api.file(path).then(blob => { if (!active) return; url = URL.createObjectURL(blob); setSource(url); }).catch(() => { if (active) setSource(""); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [api, path, hasPhoto, version]);
  return <Avatar className={className}>
    {source && <AvatarImage src={source} alt={"Foto de " + name} />}
    <AvatarFallback>{initials(name) || "?"}</AvatarFallback>
  </Avatar>;
}

/** Optional photo of a person or a business: choose, replace or remove. The file is sent as soon as it is picked. */
export function PhotoField({ api, path, name, hasPhoto, disabled, onChanged, label = "Foto" }: {
  api: BookingApi; path: string; name: string; hasPhoto: boolean; disabled?: boolean; onChanged: (hasPhoto: boolean) => void; label?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function upload(file: File | undefined) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError("Escolha uma imagem JPEG, PNG ou WebP de até 2 MB."); return;
    }
    const data = new FormData(); data.set("file", file);
    setBusy(true); setError("");
    try { await api.mutate(path, "PUT", data); setVersion(v => v + 1); onChanged(true); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível enviar a foto."); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  async function remove() {
    setBusy(true); setError("");
    try { await api.mutate(path, "DELETE"); setVersion(v => v + 1); onChanged(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível remover a foto."); }
    finally { setBusy(false); }
  }
  return <Field data-invalid={!!error || undefined}>
    <FieldLabel htmlFor={id}>{label} <span className="font-normal text-muted-foreground">(opcional)</span></FieldLabel>
    <div className="bk-photo">
      <Picture api={api} path={path} name={name} hasPhoto={hasPhoto} version={version} />
      <div className="bk-photo-actions">
        <Button type="button" variant="outline" size="sm" disabled={disabled || busy} onClick={() => input.current?.click()}><Camera data-icon="inline-start" />{hasPhoto ? "Trocar foto" : "Escolher foto"}</Button>
        {hasPhoto && <Button type="button" variant="ghost" size="sm" disabled={disabled || busy} onClick={remove}><Trash2 data-icon="inline-start" />Remover</Button>}
      </div>
    </div>
    <input ref={input} id={id} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" disabled={disabled || busy} aria-invalid={!!error || undefined} onChange={event => void upload(event.target.files?.[0])} />
    <FieldDescription>{error || "JPEG, PNG ou WebP até 2 MB. A foto é redimensionada."}</FieldDescription>
  </Field>;
}
