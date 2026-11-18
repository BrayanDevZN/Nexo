import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Film, Image as ImageIcon, Paperclip, Play, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { createApi } from "./api";

export type MediaItem = { id: string; kind: "image" | "video"; content_type: string; filename: string; size: number };
type Api = ReturnType<typeof createApi>;

export const MEDIA_ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,.mp4";
export const MAX_MEDIA_IMAGE = 10 * 1024 * 1024;
export const MAX_MEDIA_VIDEO = 50 * 1024 * 1024;
export const MAX_MEDIA_COUNT = 12;

export function isAllowedMedia(file: File) {
  const video = file.type === "video/mp4" || file.name.toLowerCase().endsWith(".mp4");
  const image = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
  if (video) return file.size <= MAX_MEDIA_VIDEO ? "" : `O vídeo “${file.name}” passa de 50 MB.`;
  if (image) return file.size <= MAX_MEDIA_IMAGE ? "" : `A imagem “${file.name}” passa de 10 MB.`;
  return `“${file.name}” não é suportado. Use JPEG, PNG, WebP ou MP4.`;
}

/** Fetches an authenticated media blob and exposes it as an object URL. */
export function useMediaUrl(api: Api, automationId: string, item: MediaItem | undefined, enabled = true) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setUrl(""); setFailed(false);
    if (!item || !enabled) return;
    let active = true; let objectUrl = "";
    void api.file(`/automations/${encodeURIComponent(automationId)}/media/${encodeURIComponent(item.id)}`).then(blob => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [api, automationId, item?.id, enabled]);
  return { url, failed };
}

/** Card preview: first image, or a video placeholder when the first item is a video. */
export function MediaCover({ api, automationId, media }: { api: Api; automationId: string; media: MediaItem[] }) {
  const first = media.find(item => item.kind === "image") ?? media[0];
  const { url } = useMediaUrl(api, automationId, first?.kind === "image" ? first : undefined);
  if (!first) return null;
  return <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-muted">
    {first.kind === "image" ? (url ? <img src={url} alt={first.filename} className="size-full object-cover" loading="lazy" /> : <Skeleton className="size-full" />)
      : <div className="flex size-full items-center justify-center text-muted-foreground"><Film className="size-10" /></div>}
    {first.kind === "video" && <span className="absolute inset-0 flex items-center justify-center"><span className="flex size-12 items-center justify-center rounded-full bg-background/80 text-foreground shadow"><Play /></span></span>}
    {media.length > 1 && <Badge variant="secondary" className="absolute right-2 bottom-2">{media.length} arquivos</Badge>}
  </div>;
}

function Thumb({ api, automationId, item, active, onSelect }: { api: Api; automationId: string; item: MediaItem; active: boolean; onSelect: () => void }) {
  const { url } = useMediaUrl(api, automationId, item.kind === "image" ? item : undefined);
  return <button type="button" onClick={onSelect} aria-label={`Ver ${item.filename}`} aria-current={active}
    className={`relative aspect-video h-16 shrink-0 overflow-hidden rounded-md border bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "ring-2 ring-primary" : "opacity-70 hover:opacity-100"}`}>
    {item.kind === "image" ? (url ? <img src={url} alt="" className="size-full object-cover" /> : <Skeleton className="size-full" />)
      : <span className="flex size-full items-center justify-center text-muted-foreground"><Film /></span>}
  </button>;
}

/** Large stage that renders the selected image or plays the selected MP4 in place. */
export function MediaViewer({ api, automationId, media }: { api: Api; automationId: string; media: MediaItem[] }) {
  const [index, setIndex] = useState(0);
  useEffect(() => { setIndex(0); }, [automationId]);
  const current = media[Math.min(index, media.length - 1)];
  const { url, failed } = useMediaUrl(api, automationId, current);
  if (!current) return null;
  const step = (delta: number) => setIndex(value => (value + delta + media.length) % media.length);
  return <div className="flex min-h-0 min-w-0 flex-col gap-3">
    <div className="relative flex min-h-[40dvh] flex-1 items-center justify-center overflow-hidden rounded-xl border bg-black/90">
      {failed ? <p className="text-sm text-muted-foreground">Não foi possível carregar este arquivo.</p>
        : !url ? <Skeleton className="size-full min-h-[40dvh]" />
        : current.kind === "video" ? <video key={url} src={url} controls playsInline className="max-h-[70dvh] max-w-full" />
        : <img key={url} src={url} alt={current.filename} className="max-h-[70dvh] max-w-full object-contain" />}
      {media.length > 1 && <>
        <Button type="button" variant="secondary" size="icon" className="absolute top-1/2 left-3 -translate-y-1/2" aria-label="Anterior" onClick={() => step(-1)}><ChevronLeft /></Button>
        <Button type="button" variant="secondary" size="icon" className="absolute top-1/2 right-3 -translate-y-1/2" aria-label="Próximo" onClick={() => step(1)}><ChevronRight /></Button>
        <Badge variant="secondary" className="absolute bottom-3 left-3">{index + 1} / {media.length}</Badge>
      </>}
    </div>
    {media.length > 1 && <div className="flex gap-2 overflow-x-auto pb-1" role="list" aria-label="Miniaturas">
      {media.map((item, position) => <div role="listitem" key={item.id}><Thumb api={api} automationId={automationId} item={item} active={position === index} onSelect={() => setIndex(position)} /></div>)}
    </div>}
  </div>;
}

/** Multi-file picker with previews for new files and removal of already saved media. */
export function MediaPicker({ files, onFiles, existing = [], removed, onRemoveExisting }: {
  files: File[]; onFiles: (files: File[]) => void; existing?: MediaItem[]; removed: string[]; onRemoveExisting: (id: string, remove: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const kept = existing.filter(item => !removed.includes(item.id));
  function add(list: FileList | null) {
    const picked = Array.from(list ?? []); if (ref.current) ref.current.value = "";
    const invalid = picked.map(isAllowedMedia).find(Boolean);
    if (invalid) { setError(invalid); return; }
    if (kept.length + files.length + picked.length > MAX_MEDIA_COUNT) { setError(`Use no máximo ${MAX_MEDIA_COUNT} arquivos de mídia.`); return; }
    setError(""); onFiles([...files, ...picked]);
  }
  return <Field data-invalid={error ? true : undefined}>
    <FieldLabel htmlFor="automation-media">Imagens e vídeos<span className="ml-1 font-normal text-muted-foreground">(opcional)</span></FieldLabel>
    <Input ref={ref} id="automation-media" type="file" multiple accept={MEDIA_ACCEPT} className="sr-only" tabIndex={-1} aria-invalid={Boolean(error)} onChange={event => add(event.currentTarget.files)} />
    <div><Button type="button" variant="outline" onClick={() => ref.current?.click()}><Paperclip data-icon="inline-start" />Adicionar imagens ou vídeos</Button></div>
    {(existing.length > 0 || files.length > 0) && <ul className="flex flex-col gap-2">
      {existing.map(item => <li key={item.id} className="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
        {item.kind === "video" ? <Film className="size-4 shrink-0 text-primary" /> : <ImageIcon className="size-4 shrink-0 text-primary" />}
        <span className={`min-w-0 flex-1 truncate text-sm ${removed.includes(item.id) ? "line-through opacity-60" : ""}`} title={item.filename}>{item.filename}</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => onRemoveExisting(item.id, !removed.includes(item.id))}>{removed.includes(item.id) ? "Desfazer" : "Remover"}</Button>
      </li>)}
      {files.map((file, position) => <li key={`${file.name}-${position}`} className="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
        {file.type.startsWith("video") || file.name.toLowerCase().endsWith(".mp4") ? <Film className="size-4 shrink-0 text-primary" /> : <ImageIcon className="size-4 shrink-0 text-primary" />}
        <span className="min-w-0 flex-1 truncate text-sm" title={file.name}>{file.name}</span>
        <Badge variant="outline" className="shrink-0">{file.size >= 1048576 ? `${(file.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`}</Badge>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remover ${file.name}`} onClick={() => onFiles(files.filter((_, i) => i !== position))}><X /></Button>
      </li>)}
    </ul>}
    <FieldDescription>JPEG, PNG, WebP (até 10 MB) e MP4 (até 50 MB). Até {MAX_MEDIA_COUNT} arquivos.</FieldDescription>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </Field>;
}
