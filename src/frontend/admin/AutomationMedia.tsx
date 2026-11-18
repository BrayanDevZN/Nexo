import { useEffect, useRef, useState } from "react";
import { Film, Image as ImageIcon, Paperclip, Play, X } from "lucide-react";
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

function MediaBlock({ api, automationId, item, position, total }: { api: Api; automationId: string; item: MediaItem; position: number; total: number }) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(position === 0);
  useEffect(() => {
    const node = ref.current;
    if (visible || !node) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: "400px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);
  const { url, failed } = useMediaUrl(api, automationId, item, visible);
  return <figure ref={ref} className="flex flex-col gap-2">
    <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-xl border bg-black/90">
      {failed ? <p className="p-6 text-sm text-muted-foreground">Não foi possível carregar este arquivo.</p>
        : !url ? <Skeleton className="aspect-video w-full rounded-none" />
        : item.kind === "video" ? <video src={url} controls playsInline preload="metadata" className="max-h-[78dvh] w-full" />
        : <img src={url} alt={item.filename} className="max-h-[78dvh] w-full object-contain" />}
    </div>
    <figcaption className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span className="min-w-0 truncate" title={item.filename}>{item.filename}</span>
      <Badge variant="outline" className="shrink-0">{position + 1} / {total}</Badge>
    </figcaption>
  </figure>;
}

/** Every image and MP4 stacked at full width, so the whole set is seen by scrolling. */
export function MediaViewer({ api, automationId, media }: { api: Api; automationId: string; media: MediaItem[] }) {
  return <div className="flex flex-col gap-6 pr-3">
    {media.map((item, position) => <MediaBlock key={item.id} api={api} automationId={automationId} item={item} position={position} total={media.length} />)}
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
