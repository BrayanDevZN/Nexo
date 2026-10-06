import { useCallback, useEffect, useState } from "react";
import { Bell, Building2, FileText, RefreshCw, Users } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { type createApi, type User } from "./api";
import { MemberPhoto } from "./MemberPhoto";
import { Feedback, Loading, message } from "./shared";

type Overview = { members_count: number; clients_count: number; funnel: Record<string, number>; potential_value: number; closed_value: number; conversion_rate: number; documents_count: number; documents: { id: string; filename: string; size: number; created_by_name: string; created_at: string }[]; contracts_by_month: { month: string; label: string; count: number }[]; announcements: { id: string; kind: string; title: string | null; body: string | null; read_at: string | null; created_at: string }[] };

const contractsChartConfig = { count: { label: "Contratos", color: "var(--primary)" } };

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
  return <section className="flex flex-col gap-6" aria-labelledby="home-title">
    <div className="admin-section-head"><div><span className="admin-eyebrow">VISÃO GERAL</span><h1 id="home-title">Início</h1><p>Acompanhe a operação da Nexo em um só lugar.</p></div><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw data-icon="inline-start" /> Atualizar</Button></div>
    <Feedback error={error} />
    {loading && !overview ? <Loading /> : overview && <>
      <Card className="overflow-hidden"><CardContent className="flex flex-wrap items-center justify-between gap-5 p-6"><div className="flex items-center gap-4"><MemberPhoto api={api} id={user.id} name={user.name} hasPhoto={!!user.profile_photo} /><div><p className="text-sm text-muted-foreground">Bem-vindo de volta</p><h2 className="text-2xl font-semibold tracking-tight">Olá, {user.name.split(" ")[0]}!</h2><p className="mt-1 text-sm text-muted-foreground">Pronto para acompanhar os próximos fechamentos?</p></div></div><Badge variant="secondary">{user.role === "admin" ? "Administrador" : "Membro"}</Badge></CardContent></Card>
      <div className="grid gap-4 md:grid-cols-3"><Card><CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardDescription>Membros ativos</CardDescription><CardTitle className="text-3xl">{overview.members_count}</CardTitle></div><Users className="size-5 text-primary" /></CardHeader></Card><Card><CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardDescription>Oportunidades</CardDescription><CardTitle className="text-3xl">{overview.clients_count}</CardTitle></div><Building2 className="size-5 text-primary" /></CardHeader></Card><Card><CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardDescription>Conversão</CardDescription><CardTitle className="text-3xl">{overview.conversion_rate.toFixed(1)}%</CardTitle></div><Badge variant="secondary">{overview.funnel.won || 0} ganhos</Badge></CardHeader></Card></div>
      <div className="grid gap-4 md:grid-cols-2"><Card><CardHeader><CardDescription>Valor potencial</CardDescription><CardTitle>{overview.potential_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</CardTitle></CardHeader></Card><Card><CardHeader><CardDescription>Valor fechado</CardDescription><CardTitle>{overview.closed_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</CardTitle></CardHeader></Card></div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]"><Card><CardHeader><CardTitle>Contratos fechados</CardTitle><CardDescription>Quantidade de contratos fechados nos últimos cinco meses.</CardDescription></CardHeader><CardContent><ChartContainer config={contractsChartConfig} className="h-72" aria-label="Gráfico de área dos contratos fechados nos últimos cinco meses"><AreaChart data={overview.contracts_by_month} margin={{ top: 18, right: 16, bottom: 4, left: 0 }}><CartesianGrid vertical={false} strokeDasharray="4 4" /><XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} /><YAxis domain={[0, "auto"]} allowDecimals={false} tickLine={false} axisLine={false} width={34} /><ChartTooltip cursor={false} content={<ChartTooltipContent formatter={value => `${value} ${value === 1 ? "contrato" : "contratos"}`} />} /><Area type="monotone" dataKey="count" name="Contratos" stroke="var(--color-count)" strokeWidth={2.5} fill="var(--color-count)" fillOpacity={0.28} dot={{ r: 4 }} activeDot={{ r: 7 }} isAnimationActive={false} /></AreaChart></ChartContainer></CardContent></Card><Card><CardHeader><CardTitle>Prévia de avisos</CardTitle><CardDescription>As últimas comunicações da equipe.</CardDescription></CardHeader><CardContent>{overview.announcements.length ? <div className="flex flex-col gap-4">{overview.announcements.map(notice => <div key={notice.id} className="flex gap-3"><Bell className="mt-1 size-4 shrink-0 text-primary" /><div className="min-w-0"><p className="font-medium">{notice.title || "Aviso da Nexo"}</p><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{notice.body}</p></div></div>)}</div> : <Empty><EmptyHeader><EmptyMedia variant="icon"><FileText /></EmptyMedia><EmptyTitle>Nenhum aviso</EmptyTitle><EmptyDescription>As atualizações aparecerão aqui.</EmptyDescription></EmptyHeader></Empty>}</CardContent></Card></div>
      <Card><CardHeader><CardTitle>Documentos recentes</CardTitle><CardDescription>Os últimos arquivos compartilhados pela equipe.</CardDescription></CardHeader><CardContent>{overview.documents.length ? <div className="grid gap-3 md:grid-cols-3">{overview.documents.map(document => <div key={document.id} className="rounded-lg border p-4"><div className="flex items-start gap-3"><FileText className="mt-0.5 size-5 shrink-0 text-primary" /><div className="min-w-0"><p className="break-all font-medium">{document.filename}</p><p className="mt-1 text-xs text-muted-foreground">{document.created_by_name} · {Math.ceil(document.size / 1024)} KB</p></div></div></div>)}</div> : <p className="text-sm text-muted-foreground">Nenhum documento salvo ainda.</p>}</CardContent></Card>
    </>}
  </section>;
}
