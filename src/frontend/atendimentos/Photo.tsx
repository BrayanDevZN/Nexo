import { useEffect, useId, useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import type { BookingApi } from "./api";

export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("");

/**
 * Phone photos are often 3-10 MB or HEIC. Decode whatever the browser can read, shrink it to at most 1280 px and
 * return a small JPEG, so the picked file works instead of being refused for its size or format.
 */
export async function preparePhoto(file: File): Promise<File> {
  if (file.type && !file.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem.");
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error("Não foi possível ler essa imagem. Tente uma foto JPEG ou PNG."); }
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível processar a imagem neste aparelho.");
  context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("Não foi possível processar a imagem.");
  return new File([blob], "foto.jpg", { type: "image/jpeg" });
}

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
    setBusy(true); setError("");
    try {
      const data = new FormData(); data.set("file", await preparePhoto(file));
      await api.mutate(path, "PUT", data); setVersion(v => v + 1); onChanged(true); }
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
    <input ref={input} id={id} type="file" className="sr-only" accept="image/*" disabled={disabled || busy} aria-invalid={!!error || undefined} onChange={event => void upload(event.target.files?.[0])} />
    <FieldDescription className={error ? "text-destructive" : undefined} role={error ? "alert" : undefined}>{error || "Qualquer foto do celular serve; ela é redimensionada."}</FieldDescription>
  </Field>;
}
