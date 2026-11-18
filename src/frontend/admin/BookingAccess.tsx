import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Link2, RefreshCw, Trash2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { BookingAccessLink, BookingAccessUser, BookingAccessUsers, createApi } from "./api";
import { MemberPhoto } from "./MemberPhoto";
import { Busy, Feedback, Field, FieldGroup, FieldLabel, Loading, TextField, message } from "./shared";

type Api = ReturnType<typeof createApi>;
export const DURATIONS: { value: string; label: string }[] = [
  { value: "", label: "Sem data para acabar" }, { value: "7", label: "7 dias" }, { value: "15", label: "15 dias" }, { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" }, { value: "180", label: "6 meses" }, { value: "365", label: "1 ano" },
];
export const SYSTEM_LABELS = { crm: "CRM", atendimentos: "Atendimento" } as const;
export const accessLabel = (user: BookingAccessUser) => user.status === "pending" ? "Aguardando liberação" : user.status === "rejected" ? "Acesso removido" : user.status === "expired" ? "Acesso expirou" : "Acesso liberado";
const day = (value: string) => new Date(value.endsWith("Z") ? value : value + "Z").toLocaleDateString("pt-BR");
export const accessUntil = (user: BookingAccessUser) => user.status === "approved" ? (user.access_expires_at ? "até " + day(user.access_expires_at) : "sem data para acabar") : user.status === "expired" && user.access_expires_at ? "terminou em " + day(user.access_expires_at) : "";
export const onLive = (reload: () => void) => {
  const handler = (event: Event) => { if (["ready", "booking.access.changed"].includes((event as CustomEvent).detail.type)) reload(); };
  window.addEventListener("nexo:realtime", handler);
  return () => window.removeEventListener("nexo:realtime", handler);
};

/** Approving, or changing how long the permission lasts: with an end date or without one. */
export function AccessDecisionDialog({ api, user, decision, onClose, onDone }: { api: Api; user?: BookingAccessUser; decision: "approved" | "rejected"; onClose: () => void; onDone: (text: string) => void }) {
  const [days, setDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setDays(""); setError(""); }, [user?.id, decision]);
  async function confirm() {
    if (!user || busy) return;
    setBusy(true); setError("");
    try {
      await api.mutate("/admin/atendimentos/users/" + user.id, "PATCH", decision === "approved" ? { decision, ...(days ? { days: Number(days) } : {}) } : { decision });
      onDone(decision === "approved" ? (user.status === "approved" ? "Validade do acesso atualizada." : "Acesso liberado. A pessoa recebe um e-mail.") : "Permissão removida.");
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  const renew = user?.status === "approved";
  return <Dialog open={!!user} onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent showCloseButton={!busy}>
      <DialogHeader><DialogTitle>{decision === "rejected" ? "Tirar a permissão?" : renew ? "Alterar a validade do acesso" : "Liberar o acesso ao Atendimentos?"}</DialogTitle>
        <DialogDescription>{decision === "rejected" ? `${user?.name} perde o acesso agora, em tempo real. A conta e os dados continuam guardados e você pode liberar de novo.` : `${user?.name} poderá usar o Atendimentos. Escolha por quanto tempo; ao acabar, o acesso é encerrado sozinho.`}</DialogDescription></DialogHeader>
      <Feedback error={error} />
      {decision === "approved" && <FieldGroup><Field><FieldLabel htmlFor="access-days">Validade do acesso</FieldLabel>
        <NativeSelect id="access-days" value={days} onChange={event => setDays(event.target.value)}>{DURATIONS.map(item => <NativeSelectOption key={item.value} value={item.value}>{item.label}</NativeSelectOption>)}</NativeSelect></Field></FieldGroup>}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button>
        <Button variant={decision === "rejected" ? "destructive" : "default"} disabled={busy} onClick={() => void confirm()}>{busy ? <Busy /> : decision === "rejected" ? "Tirar permissão" : renew ? "Salvar validade" : "Liberar acesso"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

/** The owner's side of who may use the Atendimentos: people waiting, and the links that let someone in at once. */
export function BookingAccess({ api, onOpenMembers, onCounts }: { api: Api; onOpenMembers: () => void; onCounts?: (pending: number) => void }) {
  const [data, setData] = useState<BookingAccessUsers>();
  const [links, setLinks] = useState<BookingAccessLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deciding, setDeciding] = useState<{ user: BookingAccessUser; decision: "approved" | "rejected" }>();
  const [linkOpen, setLinkOpen] = useState(false);
  const [created, setCreated] = useState<BookingAccessLink>();
  const [busy, setBusy] = useState(false);
  const counts = useRef(onCounts);
  counts.current = onCounts;
  const load = useCallback(async () => {
    try {
      const [users, list] = await Promise.all([api.request<BookingAccessUsers>("/admin/atendimentos/users?status=pending&limit=50"), api.request<BookingAccessLink[]>("/admin/atendimentos/links")]);
      setData(users); setLinks(list); setError(""); counts.current?.(users.counts.pending);
    } catch (e) { setError(message(e)); } finally { setLoading(false); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => onLive(() => void load()), [load]);
  async function createLink(form: HTMLFormElement) {
    const values = Object.fromEntries(new FormData(form)) as Record<string, string>;
    setBusy(true); setError("");
    try {
      const link = await api.mutate<BookingAccessLink>("/admin/atendimentos/links", "POST", {
        note: values.note || null, ...(values.days ? { access_days: Number(values.days) } : {}), max_uses: Number(values.uses || 1), valid_days: Number(values.valid || 14),
      });
      setCreated(link); await load();
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  async function copy(url: string) {
    try { await navigator.clipboard.writeText(url); setSuccess("Link copiado."); } catch { setError("Não foi possível copiar automaticamente. Selecione e copie o link."); }
  }
  async function removeLink(link: BookingAccessLink) {
    try { await api.mutate("/admin/atendimentos/links/" + link.id, "DELETE"); setSuccess("Link apagado."); await load(); } catch (e) { setError(message(e)); }
  }
  const pending = data?.users ?? [];
  return <div className="flex flex-col gap-6">
    <Feedback error={deciding || linkOpen ? "" : error} success={success} />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">Quem cria conta no Atendimentos sem um link fica esperando aqui. Quem entra por um link seu usa o sistema na hora, pelo tempo que você definir.</p>
      <div className="flex flex-wrap gap-2"><Button onClick={() => { setCreated(undefined); setLinkOpen(true); }}><Link2 data-icon="inline-start" /> Criar link de acesso</Button><Button variant="outline" onClick={onOpenMembers}><Users data-icon="inline-start" /> Ver todos os usuários</Button><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw data-icon="inline-start" /> Atualizar</Button></div>
    </div>
    <div className="flex flex-col gap-3"><h2 className="text-lg font-semibold">Aguardando liberação {data ? <Badge variant="secondary">{data.counts.pending}</Badge> : null}</h2>
      {loading ? <Loading /> : !pending.length ? <Empty><EmptyHeader><EmptyMedia variant="icon"><Check /></EmptyMedia><EmptyTitle>Ninguém esperando</EmptyTitle><EmptyDescription>Novos cadastros do Atendimentos aparecem aqui na hora.</EmptyDescription></EmptyHeader></Empty> : <div className="admin-client-grid">{pending.map(user => <Card key={user.id}>
        <CardHeader><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-3"><MemberPhoto api={api} id={user.id} name={user.name} hasPhoto={user.has_photo} path={"/admin/atendimentos/users/" + user.id + "/photo"} /><CardTitle>{user.name}</CardTitle></div><Badge variant="secondary">Atendimento</Badge></div><CardDescription>Cadastro em {day(user.created_at)}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-1"><p className="break-all">{user.email}</p><p className="text-sm text-muted-foreground">{user.phone || "Celular não informado"}</p></CardContent>
        <CardFooter className="flex-wrap gap-2"><Button onClick={() => setDeciding({ user, decision: "approved" })}><Check data-icon="inline-start" /> Liberar</Button><Button variant="destructive" onClick={() => setDeciding({ user, decision: "rejected" })}><X data-icon="inline-start" /> Recusar</Button></CardFooter>
      </Card>)}</div>}</div>
    <div className="flex flex-col gap-3"><h2 className="text-lg font-semibold">Links de acesso</h2>
      {!links.length ? <p className="text-sm text-muted-foreground">Nenhum link criado. Crie um e envie para quem você quer liberar.</p> : <div className="flex flex-col gap-2">{links.map(link => <Card key={link.id}><CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="flex flex-col gap-1"><strong>{link.note || "Link sem nome"}</strong><span className="text-sm text-muted-foreground">Acesso {link.access_days ? `de ${link.access_days} ${link.access_days === 1 ? "dia" : "dias"}` : "sem data para acabar"} · {link.uses}/{link.max_uses} {link.max_uses === 1 ? "uso" : "usos"} · o link vale até {day(link.expires_at)}</span></div>
        <div className="flex items-center gap-2"><Badge variant={link.active ? "default" : "outline"}>{link.active ? "Ativo" : link.uses >= link.max_uses ? "Usado" : "Vencido"}</Badge><Button variant="outline" size="sm" onClick={() => void removeLink(link)} aria-label={"Apagar link " + (link.note || "")}><Trash2 data-icon="inline-start" /> Apagar</Button></div>
      </CardContent></Card>)}</div>}</div>
    <AccessDecisionDialog api={api} user={deciding?.user} decision={deciding?.decision || "approved"} onClose={() => setDeciding(undefined)} onDone={text => { setDeciding(undefined); setSuccess(text); void load(); }} />
    <Dialog open={linkOpen} onOpenChange={open => { if (!busy) setLinkOpen(open); }}><DialogContent>
      <DialogHeader><DialogTitle>Criar link de acesso</DialogTitle><DialogDescription>Quem criar a conta por este link usa o Atendimentos na hora, sem esperar aprovação. Você define por quanto tempo vale a permissão.</DialogDescription></DialogHeader>
      <Feedback error={error} />
      {created?.url ? <FieldGroup><Field><FieldLabel htmlFor="access-url">Link pronto: copie e envie. Ele aparece só agora.</FieldLabel><div className="flex gap-2"><Input id="access-url" value={created.url} readOnly /><Button type="button" variant="outline" onClick={() => void copy(created.url!)} aria-label="Copiar link"><Copy /></Button></div></Field></FieldGroup>
        : <form id="access-link-form" className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); void createLink(event.currentTarget); }}><FieldGroup>
          <TextField label="Para quem é (opcional)" name="note" maxLength={160} placeholder="Ex.: Barbearia do João" />
          <Field><FieldLabel htmlFor="link-days">Validade da permissão</FieldLabel><NativeSelect id="link-days" name="days" defaultValue="">{DURATIONS.map(item => <NativeSelectOption key={item.value} value={item.value}>{item.label}</NativeSelectOption>)}</NativeSelect><p className="text-sm text-muted-foreground">Conta a partir de quando a pessoa cria a conta. Ao acabar, ela perde o acesso sozinha.</p></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="link-uses">Quantas pessoas podem usar</FieldLabel><NativeSelect id="link-uses" name="uses" defaultValue="1">{[1, 2, 5, 10, 25, 50].map(n => <NativeSelectOption key={n} value={String(n)}>{n === 1 ? "1 pessoa" : n + " pessoas"}</NativeSelectOption>)}</NativeSelect></Field>
            <Field><FieldLabel htmlFor="link-valid">O link vale por</FieldLabel><NativeSelect id="link-valid" name="valid" defaultValue="14">{[3, 7, 14, 30, 60].map(n => <NativeSelectOption key={n} value={String(n)}>{n} dias</NativeSelectOption>)}</NativeSelect></Field></div>
        </FieldGroup></form>}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setLinkOpen(false)}>Fechar</Button>{!created && <Button type="submit" form="access-link-form" disabled={busy}>{busy ? <Busy /> : <><Link2 data-icon="inline-start" /> Gerar link</>}</Button>}</DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
