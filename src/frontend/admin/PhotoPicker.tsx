import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, Upload, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";

export function PhotoPicker({ disabled = false, onSelect }: { disabled?: boolean; onSelect?: (file: File | undefined) => void }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <Field data-invalid={!!error}>
    <FieldLabel htmlFor={id} className="sr-only">Escolher foto</FieldLabel>
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed bg-muted/40 p-6">
      {preview ? <img src={preview} alt="Prévia da foto selecionada" className="admin-avatar" /> :
        <div className="admin-avatar flex items-center justify-center bg-muted"><UserRound aria-hidden="true" className="size-10 text-muted-foreground" /></div>}
      <input ref={input} id={id} name="file" type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" disabled={disabled} aria-invalid={!!error} onChange={event => {
        const selected = event.target.files?.[0]; setError("");
        if (selected && (!["image/jpeg", "image/png", "image/webp"].includes(selected.type) || selected.size > 2 * 1024 * 1024)) {
          setError("Escolha JPEG, PNG ou WebP de até 2 MB."); event.target.value = ""; setFile(undefined); onSelect?.(undefined); return;
        }
        setFile(selected); onSelect?.(selected);
      }} />
      <Button variant="outline" type="button" disabled={disabled} onClick={() => input.current?.click()}>
        {file ? <Upload data-icon="inline-start" /> : <ImagePlus data-icon="inline-start" />}{file ? "Escolher outra foto" : "Selecionar foto"}
      </Button>
      <p className="text-sm text-muted-foreground text-center">{file ? file.name : "JPEG, PNG ou WebP • Até 2 MB"}</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  </Field>;
}
