import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Building2, FileText, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { type createApi, type User } from "./api";
import { MemberPhoto } from "./MemberPhoto";
import { Feedback, Loading, message } from "./shared";

type Overview = { members_count: number; clients_count: number; funnel: Record<string, number>; potential_value: number; closed_value: number; conversion_rate: number; documents_count: number; documents: { id: string; filename: string; size: number; created_by_name: string; created_at: string }[]; contracts_by_month: { month: string; label: string; count: number }[]; announcements: { id: string; kind: string; title: string | null; body: string | null; read_at: string | null; created_at: string }[] };

export function Home({ api, user }: { api: ReturnType<typeof createApi>; user: User }) {
  const [overview, setOverview] = useState<Overview>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setOverview(await api.request<Overview>("/dashboard")); } catch (e) { setError(message(e)); } finally { setLoading(false); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const event = (value: Event) => { if (["ready", "notifications.changed", "account.changed"].includes((value as CustomEvent).detail.type)) void load(); };
    window.addEventListener("nexo:realtime", event); return () => window.removeEventListener("nexo:realtime", event);
  }, [load]);
  const maxContracts = useMemo(() => Math.max(1, ...(overview?.contracts_by_month || []).map(row => row.count)), [overview]);
  return <section className="flex flex-col gap-6" aria-labelledby="home-title">
    <div className="admin-section-head"><div><span className="admin-eyebrow">VISÃO GERAL</span><h1 id="home-title">Início</h1><p>Acompanhe a operação da Nexo em um só lugar.</p></div><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw data-icon="inline-start" /> Atualizar</Button></div>
    <Feedback error={error} />
    {loading && !overview ? <Loading /> : overview && <>
      <Card className="overflow-hidden"><CardContent className="flex flex-wrap items-center justify-between gap-5 p-6"><div className="flex items-center gap-4"><MemberPhoto api={api} id={user.id} name={user.name} hasPhoto={!!user.profile_photo} /><div><p className="text-sm text-muted-foreground">Bem-vindo de volta</p><h2 className="text-2xl font-semibold tracking-tight">Olá, {user.name.split(" ")[0]}!</h2><p className="mt-1 text-sm text-muted-foreground">Pronto para acompanhar os próximos fechamentos?</p></div></div><Badge variant="secondary">{user.role === "admin" ? "Administrador" : "Membro"}</Badge></CardContent></Card>
      <div className="grid gap-4 md:grid-cols-3"><Card><CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardDescription>Membros ativos</CardDescription><CardTitle className="text-3xl">{overview.members_count}</CardTitle></div><Users className="size-5 text-primary" /></CardHeader></Card><Card><CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardDescription>Oportunidades</CardDescription><CardTitle className="text-3xl">{overview.clients_count}</CardTitle></div><Building2 className="size-5 text-primary" /></CardHeader></Card><Card><CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardDescription>Conversão</CardDescription><CardTitle className="text-3xl">{overview.conversion_rate.toFixed(1)}%</CardTitle></div><Badge variant="secondary">{overview.funnel.won || 0} ganhos</Badge></CardHeader></Card></div>
      <div className="grid gap-4 md:grid-cols-2"><Card><CardHeader><CardDescription>Valor potencial</CardDescription><CardTitle>{overview.potential_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</CardTitle></CardHeader></Card><Card><CardHeader><CardDescription>Valor fechado</CardDescription><CardTitle>{overview.closed_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</CardTitle></CardHeader></Card></div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]"><Card><CardHeader><CardTitle>Contratos fechados</CardTitle><CardDescription>Quantidade de contratos fechados por mês.</CardDescription></CardHeader><CardContent><div className="relative h-72 overflow-hidden rounded-xl border bg-muted/20 p-4" role="img" aria-label="Gráfico de contratos fechados por mês"><div className="pointer-events-none absolute inset-x-4 top-4 bottom-12 flex flex-col justify-between">{[100, 75, 50, 25, 0].map(value => <div key={value} className="flex items-center gap-2"><span className="w-7 text-right text-[10px] tabular-nums text-muted-foreground">{Math.round(maxContracts * value / 100)}</span><div className="h-px flex-1 bg-border/70" /></div>)}</div><div className="relative flex h-full items-end gap-3 pl-9 pb-7">{overview.contracts_by_month.map(row => <div key={row.month} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2" title={`${row.label}: ${row.count} contratos`}><span className="text-xs font-semibold tabular-nums opacity-80 transition-opacity group-hover:opacity-100">{row.count}</span><div className="w-full rounded-t-md bg-gradient-to-t from-primary to-primary/60 shadow-sm transition-[height,filter] duration-200 group-hover:brightness-110" style={{ height: `${Math.max(row.count ? 10 : 3, row.count / maxContracts * 100)}%` }} /><span className="truncate text-[11px] text-muted-foreground">{row.label}</span></div>)}</div></div></CardContent></Card><Card><CardHeader><CardTitle>Prévia de avisos</CardTitle><CardDescription>As últimas comunicações da equipe.</CardDescription></CardHeader><CardContent>{overview.announcements.length ? <div className="flex flex-col gap-4">{overview.announcements.map(notice => <div key={notice.id} className="flex gap-3"><Bell className="mt-1 size-4 shrink-0 text-primary" /><div className="min-w-0"><p className="font-medium">{notice.title || "Aviso da Nexo"}</p><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{notice.body}</p></div></div>)}</div> : <Empty><EmptyHeader><EmptyMedia variant="icon"><FileText /></EmptyMedia><EmptyTitle>Nenhum aviso</EmptyTitle><EmptyDescription>As atualizações aparecerão aqui.</EmptyDescription></EmptyHeader></Empty>}</CardContent></Card></div>
      <Card><CardHeader><CardTitle>Documentos recentes</CardTitle><CardDescription>Os últimos arquivos compartilhados pela equipe.</CardDescription></CardHeader><CardContent>{overview.documents.length ? <div className="grid gap-3 md:grid-cols-3">{overview.documents.map(document => <div key={document.id} className="rounded-lg border p-4"><div className="flex items-start gap-3"><FileText className="mt-0.5 size-5 shrink-0 text-primary" /><div className="min-w-0"><p className="break-all font-medium">{document.filename}</p><p className="mt-1 text-xs text-muted-foreground">{document.created_by_name} · {Math.ceil(document.size / 1024)} KB</p></div></div></div>)}</div> : <p className="text-sm text-muted-foreground">Nenhum documento salvo ainda.</p>}</CardContent></Card>
    </>}
  </section>;
}
