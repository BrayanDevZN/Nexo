import { useEffect, useId, useRef, useState } from "react";
import { Pencil, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";

export function PhotoPicker({ disabled = false, onSelect, source = "", alt = "Foto de perfil" }: {
  disabled?: boolean; onSelect?: (file: File | undefined) => void; source?: string; alt?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => { setFailed(false); }, [preview, source]);
  return <Field data-invalid={!!error}>
    <FieldLabel htmlFor={id} className="sr-only">Escolher foto</FieldLabel>
    <div className="flex flex-col items-center gap-3">
      <div className="relative size-24">
        {(preview || source) && !failed ? <img src={preview || source} alt={preview ? "Prévia da foto selecionada" : alt} className="admin-avatar" onError={() => setFailed(true)} /> :
          <div className="admin-avatar flex items-center justify-center" aria-label="Sem foto"><UserRound aria-hidden="true" className="size-10" /></div>}
        <Button className="absolute right-0 bottom-0" size="icon-lg" type="button" disabled={disabled} aria-label="Alterar foto de perfil" title="Alterar foto de perfil" onClick={() => input.current?.click()}><Pencil /></Button>
      </div>
      <input ref={input} id={id} name="file" type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" disabled={disabled} aria-invalid={!!error} aria-describedby={id + "-help"} onChange={event => {
        const selected = event.target.files?.[0]; setError("");
        if (!selected) return;
        if (!["image/jpeg", "image/png", "image/webp"].includes(selected.type) || selected.size > 2 * 1024 * 1024) {
          setError("Escolha JPEG, PNG ou WebP de até 2 MB."); event.target.value = ""; setFile(undefined); onSelect?.(undefined); return;
        }
        setFile(selected); onSelect?.(selected);
      }} />
      <p id={id + "-help"} className="text-sm text-muted-foreground text-center">{file ? file.name : "Toque no lápis para escolher uma foto."}</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  </Field>;
}
