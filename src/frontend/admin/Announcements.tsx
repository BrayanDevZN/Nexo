import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Bell, Megaphone, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { type createApi, type User } from "./api";
import { Busy, Feedback, Field, FieldGroup, FieldLabel, Loading, TextField, message } from "./shared";
import { Textarea } from "@/components/ui/textarea";

type Notice = { id: string; kind: "announcement" | "member_joined"; announcement_id: string | null; title: string | null; body: string | null; read_at: string | null; created_at: string; updated_at: string };

export function Announcements({ api, user }: { api: ReturnType<typeof createApi>; user: User }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showComposer, setShowComposer] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setNotices(await api.request<Notice[]>("/notifications?limit=100&offset=0")); }
    catch (e) { setError(message(e)); } finally { setLoading(false); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const event = (value: Event) => { const type = (value as CustomEvent).detail.type; if (["ready", "notifications.changed"].includes(type)) void load(); };
    window.addEventListener("nexo:realtime", event); return () => window.removeEventListener("nexo:realtime", event);
  }, [load]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget); const title = String(form.get("title") || "").trim(); const body = String(form.get("body") || "").trim();
    setBusy(true); setError(""); setSuccess("");
    try { await api.mutate("/admin/announcements", "POST", { title, body }); setSuccess("Aviso publicado e enviado aos membros aprovados."); setShowComposer(false); event.currentTarget.reset(); await load(); }
    catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  async function markRead(notice: Notice) {
    if (notice.read_at) return;
    setNotices(rows => rows.map(row => row.id === notice.id ? { ...row, read_at: new Date().toISOString() } : row));
    try { await api.mutate("/notifications/" + notice.id + "/read", "PATCH"); } catch { /* the notice remains visible if the read marker fails */ }
  }
  return <section className="flex flex-col gap-6" aria-labelledby="announcements-title">
    <div className="admin-section-head"><div><span className="admin-eyebrow">COMUNICAÇÃO DA EQUIPE</span><h1 id="announcements-title">Avisos</h1><p>Atualizações importantes da Nexo para todos os membros.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw data-icon="inline-start" /> Atualizar</Button>{user.role === "admin" && <Button onClick={() => setShowComposer(value => !value)}><Megaphone data-icon="inline-start" /> Criar aviso</Button>}</div></div>
    <Feedback error={error} success={success} />
    {user.role === "admin" && showComposer && <Card><CardHeader><CardTitle>Novo aviso</CardTitle><CardDescription>O aviso será registrado nas notificações e enviado por email para cada membro aprovado.</CardDescription></CardHeader><CardContent><form onSubmit={create} className="flex flex-col gap-5"><FieldGroup><TextField label="Título" name="title" maxLength={160} required placeholder="Ex.: Manutenção programada" /><Field><FieldLabel htmlFor="announcement-body">Mensagem</FieldLabel><Textarea id="announcement-body" name="body" maxLength={5000} required placeholder="Escreva o aviso para a equipe…" /></Field></FieldGroup><CardFooter className="flex gap-2 px-0"><Button type="submit" disabled={busy}>{busy ? <Busy /> : "Publicar aviso"}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setShowComposer(false)}>Cancelar</Button></CardFooter></form></CardContent></Card>}
    {loading ? <Loading /> : !notices.length && !error ? <Empty><EmptyHeader><EmptyMedia variant="icon"><Bell /></EmptyMedia><EmptyTitle>Nenhum aviso por enquanto</EmptyTitle><EmptyDescription>Quando houver uma atualização da equipe, ela aparecerá aqui.</EmptyDescription></EmptyHeader></Empty> : <div className="flex flex-col gap-4">{notices.map(notice => <Card key={notice.id} className={notice.read_at ? "" : "border-primary/50"} onClick={() => void markRead(notice)}><CardHeader><div className="flex flex-wrap items-start justify-between gap-2"><CardTitle>{notice.title || "Aviso da Nexo"}</CardTitle>{!notice.read_at && <Badge>Não lido</Badge>}</div><CardDescription>{new Date(notice.created_at.endsWith("Z") ? notice.created_at : notice.created_at + "Z").toLocaleString("pt-BR")}</CardDescription></CardHeader><CardContent><p className="whitespace-pre-wrap text-sm leading-6">{notice.body}</p></CardContent></Card>)}</div>}
  </section>;
}
