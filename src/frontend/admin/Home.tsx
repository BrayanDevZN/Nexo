import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Building2, FileText, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { type createApi, type User } from "./api";
import { MemberPhoto } from "./MemberPhoto";
import { Feedback, Loading, message } from "./shared";

type Overview = { members_count: number; clients_count: number; contracts_by_month: { month: string; label: string; count: number }[]; announcements: { id: string; title: string | null; body: string | null; read_at: string | null; created_at: string }[] };

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
      <div className="grid gap-4 md:grid-cols-2"><Card><CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardDescription>Membros ativos</CardDescription><CardTitle className="text-3xl">{overview.members_count}</CardTitle></div><Users className="size-5 text-primary" /></CardHeader></Card><Card><CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardDescription>Clientes registrados</CardDescription><CardTitle className="text-3xl">{overview.clients_count}</CardTitle></div><Building2 className="size-5 text-primary" /></CardHeader></Card></div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]"><Card><CardHeader><CardTitle>Contratos fechados</CardTitle><CardDescription>Quantidade de contratos fechados por mês.</CardDescription></CardHeader><CardContent><div className="flex h-64 items-end gap-3 border-b pb-6" role="img" aria-label="Gráfico de contratos fechados por mês">{overview.contracts_by_month.map(row => <div key={row.month} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2"><span className="text-xs font-medium">{row.count}</span><div className="w-full rounded-t-md bg-primary/80 transition-[height]" style={{ height: `${Math.max(row.count ? 10 : 3, row.count / maxContracts * 100)}%` }} /><span className="truncate text-xs text-muted-foreground">{row.label}</span></div>)}</div></CardContent></Card><Card><CardHeader><CardTitle>Prévia de avisos</CardTitle><CardDescription>As últimas comunicações da equipe.</CardDescription></CardHeader><CardContent>{overview.announcements.length ? <div className="flex flex-col gap-4">{overview.announcements.map(notice => <div key={notice.id} className="flex gap-3"><Bell className="mt-1 size-4 shrink-0 text-primary" /><div className="min-w-0"><p className="font-medium">{notice.title || "Aviso da Nexo"}</p><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{notice.body}</p></div></div>)}</div> : <Empty><EmptyHeader><EmptyMedia variant="icon"><FileText /></EmptyMedia><EmptyTitle>Nenhum aviso</EmptyTitle><EmptyDescription>As atualizações aparecerão aqui.</EmptyDescription></EmptyHeader></Empty>}</CardContent></Card></div>
    </>}
  </section>;
}
