import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Bell, Megaphone, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { type createApi, type User } from "./api";
import { Busy, Feedback, Field, FieldGroup, FieldLabel, Loading, TextField, message } from "./shared";
import { Textarea } from "@/components/ui/textarea";
import { MemberPhoto } from "./MemberPhoto";

type Notice = { id: string; kind: "announcement" | "member_joined" | "chat_message" | "automation_request" | "automation_invitation" | "automation_rejected"; announcement_id: string | null; requested_user_id: string; sender_name: string | null; sender_has_photo: boolean; has_image: boolean; title: string | null; body: string | null; read_at: string | null; created_at: string; updated_at: string };

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

function newestFirst(rows: Notice[]) {
  return [...rows].sort((a, b) => Date.parse(b.created_at.endsWith("Z") ? b.created_at : b.created_at + "Z") - Date.parse(a.created_at.endsWith("Z") ? a.created_at : a.created_at + "Z") || b.id.localeCompare(a.id));
}

function NoticeImage({ api, notice }: { api: ReturnType<typeof createApi>; notice: Notice }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setUrl("");
    if (!notice.has_image) return () => { active = false; };
    void api.file(`/notifications/${encodeURIComponent(notice.id)}/image`).then(blob => {
      if (active) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }
    }).catch(() => {});
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [api, notice.has_image, notice.id]);
  return url ? <img src={url} alt={`Imagem do aviso: ${notice.title || "Aviso da Nexo"}`} className="max-h-[28rem] w-full rounded-xl border object-contain" loading="lazy" /> : null;
}

export function Announcements({ api, user, onNotificationsRead }: { api: ReturnType<typeof createApi>; user: User; onNotificationsRead?: () => Promise<void> }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showComposer, setShowComposer] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const imageInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!selectedImage) { setImagePreview(""); return; }
    const url = URL.createObjectURL(selectedImage);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedImage]);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const loaded = newestFirst(await api.request<Notice[]>("/notifications?limit=100&offset=0"));
      setNotices(loaded);
      if (loaded.some(notice => notice.kind !== "chat_message" && !notice.read_at)) {
        try {
          await api.mutate("/notifications/read", "PATCH");
          const readAt = new Date().toISOString();
          setNotices(loaded.map(notice => notice.kind !== "chat_message" && !notice.read_at
            ? { ...notice, read_at: readAt } : notice));
          await onNotificationsRead?.();
        } catch { /* keep unread indicators if marking all notices fails */ }
      }
    }
    catch (e) { setError(message(e)); } finally { setLoading(false); }
  }, [api, onNotificationsRead]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const event = (value: Event) => { const type = (value as CustomEvent).detail.type; if (["ready", "notifications.changed"].includes(type)) void load(); };
    window.addEventListener("nexo:realtime", event); return () => window.removeEventListener("nexo:realtime", event);
  }, [load]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true); setError(""); setSuccess("");
    try { await api.mutate("/admin/announcements/with-image", "POST", form); setSuccess("Aviso publicado e enviado aos membros aprovados."); setShowComposer(false); formElement.reset(); setSelectedImage(null); await load(); }
    catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] || null;
    if (file && !IMAGE_TYPES.includes(file.type)) { setError("Escolha uma imagem JPEG, PNG ou WebP."); event.currentTarget.value = ""; setSelectedImage(null); return; }
    if (file && file.size > MAX_IMAGE_BYTES) { setError("A imagem deve ter no máximo 2 MB."); event.currentTarget.value = ""; setSelectedImage(null); return; }
    setError(""); setSelectedImage(file);
  }
  async function markRead(notice: Notice) {
    if (notice.read_at) return;
    setNotices(rows => rows.map(row => row.id === notice.id ? { ...row, read_at: new Date().toISOString() } : row));
    try { await api.mutate("/notifications/" + notice.id + "/read", "PATCH"); await onNotificationsRead?.(); } catch { /* the notice remains visible if the read marker fails */ }
  }
  return <section className="flex flex-col gap-6" aria-labelledby="announcements-title">
    <div className="admin-section-head"><div><span className="admin-eyebrow">COMUNICAÇÃO DA EQUIPE</span><h1 id="announcements-title">Avisos</h1><p>Atualizações importantes da Nexo para todos os membros.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw data-icon="inline-start" /> Atualizar</Button>{user.role === "owner" && <Button onClick={() => setShowComposer(value => !value)}><Megaphone data-icon="inline-start" /> Criar aviso</Button>}</div></div>
    <Feedback error={error} success={success} />
    {user.role === "owner" && showComposer && <Card><CardHeader><CardTitle>Novo aviso</CardTitle><CardDescription>O aviso será registrado nas notificações e enviado por email para cada membro aprovado.</CardDescription></CardHeader><CardContent><form onSubmit={create} className="flex flex-col gap-5"><FieldGroup><TextField label="Título" name="title" maxLength={160} required placeholder="Ex.: Manutenção programada" /><Field><FieldLabel htmlFor="announcement-body">Mensagem</FieldLabel><Textarea id="announcement-body" name="body" maxLength={5000} required placeholder="Escreva o aviso para a equipe…" /></Field><Field><FieldLabel htmlFor="announcement-image">Foto no aviso (opcional)</FieldLabel><Input ref={imageInput} id="announcement-image" name="image" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseImage} disabled={busy} /><FieldDescription>JPEG, PNG ou WebP; até 2 MB. A imagem aparecerá dentro do aviso.</FieldDescription>{imagePreview && <div className="relative max-w-sm overflow-hidden rounded-xl border bg-muted/30 p-2"><img src={imagePreview} alt="Prévia da foto do aviso" className="max-h-56 w-full rounded-lg object-contain" /><Button type="button" variant="secondary" size="icon-sm" className="absolute right-3 top-3" aria-label="Remover foto do aviso" onClick={() => { setSelectedImage(null); if (imageInput.current) imageInput.current.value = ""; }}><X /></Button></div>}</Field></FieldGroup><CardFooter className="flex gap-2 px-0"><Button type="submit" disabled={busy}>{busy ? <Busy /> : "Publicar aviso"}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { setShowComposer(false); setSelectedImage(null); }}>Cancelar</Button></CardFooter></form></CardContent></Card>}
    {loading ? <Loading /> : !notices.length && !error ? <Empty><EmptyHeader><EmptyMedia variant="icon"><Bell /></EmptyMedia><EmptyTitle>Nenhum aviso por enquanto</EmptyTitle><EmptyDescription>Quando houver uma atualização da equipe, ela aparecerá aqui.</EmptyDescription></EmptyHeader></Empty> : <div className="flex flex-col gap-4">{notices.map(notice => <Card key={notice.id} className={notice.read_at ? "" : "border-primary/50"} onClick={() => void markRead(notice)}><CardHeader><div className="flex items-center gap-3"><MemberPhoto api={api} id={notice.requested_user_id} name={notice.sender_name || "Membro"} hasPhoto={notice.sender_has_photo} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{notice.sender_name || "Membro removido"}</p><CardDescription>{new Date(notice.created_at.endsWith("Z") ? notice.created_at : notice.created_at + "Z").toLocaleString("pt-BR")}</CardDescription></div>{!notice.read_at && <Badge>Não lido</Badge>}</div><CardTitle className="pt-2">{notice.title || "Aviso da Nexo"}</CardTitle></CardHeader><CardContent className="flex flex-col gap-4"><p className="whitespace-pre-wrap text-sm leading-6">{notice.body}</p><NoticeImage api={api} notice={notice} /></CardContent></Card>)}</div>}
  </section>;
}
