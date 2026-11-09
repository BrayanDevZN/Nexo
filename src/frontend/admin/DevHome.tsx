import { useCallback, useEffect, useMemo, useState } from "react";
import { Database, KeyRound, RefreshCw, Workflow } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ROLE_LABELS, type ApiKey, type ApiKeyUsage, type createApi, type User } from "./api";
import { MemberPhoto } from "./MemberPhoto";
import { Feedback, Loading, message } from "./shared";

export type DevPage = "api-keys" | "databases" | "automations";
type Automation = { id: string; name: string; description: string; created_by_name: string; created_at: string };
type Instance = { id: string; name: string; status: "online" | "unreachable" | "unauthorized"; details: Record<string, string | number | null> };
type AutomationRequest = { id: string; status: "pending" | "invited" | "rejected" };
type Snapshot = {
  keys?: ApiKey[]; usage?: ApiKeyUsage[]; automations?: Automation[]; instances?: Instance[]; requests?: AutomationRequest[];
};

const DAYS = 14;
const usageChartConfig = { requests: { label: "Requisições", color: "var(--primary)" } };
const STATUS: Record<Instance["status"], { label: string; variant: "default" | "destructive" }> = {
  online: { label: "Online", variant: "default" },
  unreachable: { label: "Sem conexão", variant: "destructive" },
  unauthorized: { label: "Chave recusada", variant: "destructive" },
};
const dateLabel = (value: string | null) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("pt-BR") : "—";
};

export function DevHome({ api, user, onOpen }: { api: ReturnType<typeof createApi>; user: User; onOpen: (page: DevPage) => void }) {
  const [data, setData] = useState<Snapshot>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    // Each block loads on its own, so one unavailable service never hides the others.
    const [keys, usage, automations, instances, requests] = await Promise.allSettled([
      api.request<ApiKey[]>("/auth/api-keys"),
      api.request<ApiKeyUsage[]>(`/auth/api-keys/usage?days=${DAYS}`),
      api.request<Automation[]>("/automations?limit=100&offset=0"),
      api.request<Instance[]>("/admin/databases"),
      api.request<AutomationRequest[]>("/automation-requests?limit=100&offset=0"),
    ]);
    const value = <T,>(result: PromiseSettledResult<T>) => result.status === "fulfilled" ? result.value : undefined;
    setData({ keys: value(keys), usage: value(usage), automations: value(automations), instances: value(instances), requests: value(requests) });
    const failed = [keys, usage, automations, instances, requests].filter(result => result.status === "rejected");
    if (failed.length === 5) setError(message((failed[0] as PromiseRejectedResult).reason));
    setLoading(false);
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  const chart = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const item of data?.usage ?? []) byDate.set(item.date, (byDate.get(item.date) ?? 0) + item.count);
    const today = new Date();
    return Array.from({ length: DAYS }, (_, index) => {
      const date = new Date(today); date.setDate(today.getDate() - (DAYS - index - 1));
      return { date: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), requests: byDate.get(date.toISOString().slice(0, 10)) ?? 0 };
    });
  }, [data?.usage]);
  const totalRequests = (data?.usage ?? []).reduce((sum, item) => sum + item.count, 0);
  const pendingRequests = (data?.requests ?? []).filter(item => item.status === "pending").length;
  const keysByRecentUse = [...(data?.keys ?? [])].sort((a, b) => (b.last_used_at ?? "").localeCompare(a.last_used_at ?? ""));
  const recentAutomations = [...(data?.automations ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);
  const unavailable = <p className="text-sm text-muted-foreground">Não foi possível carregar agora.</p>;

  return <section className="flex flex-col gap-6" aria-labelledby="dev-home-title">
    <div className="admin-section-head"><div><span className="admin-eyebrow">DESENVOLVIMENTO</span><h1 id="dev-home-title">Início</h1><p>Chaves, automações e infraestrutura da Nexo em um só lugar.</p></div>
      <Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw data-icon="inline-start" /> Atualizar</Button></div>
    <Feedback error={error} />
    {loading && !data ? <Loading /> : data && <>
      <Card className="overflow-hidden"><CardContent className="flex flex-wrap items-center justify-between gap-5 p-6">
        <div className="flex items-center gap-4"><MemberPhoto api={api} id={user.id} name={user.name} hasPhoto={!!user.profile_photo} />
          <div><p className="text-sm text-muted-foreground">Bem-vindo de volta</p><h2 className="text-2xl font-semibold tracking-tight">Olá, {user.name.split(" ")[0]}!</h2>
            <p className="mt-1 text-sm text-muted-foreground">Tudo o que você mantém, num só painel.</p></div></div>
        <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
      </CardContent></Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardDescription>Chaves de API ativas</CardDescription><CardTitle className="text-3xl">{data.keys ? data.keys.length : "—"}</CardTitle></div><KeyRound className="size-5 text-primary" /></CardHeader></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardDescription>Requisições em {DAYS} dias</CardDescription><CardTitle className="text-3xl">{data.usage ? totalRequests.toLocaleString("pt-BR") : "—"}</CardTitle></div><Workflow className="size-5 text-primary" /></CardHeader></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardDescription>Automações na biblioteca</CardDescription><CardTitle className="text-3xl">{data.automations ? data.automations.length : "—"}</CardTitle></div><Workflow className="size-5 text-primary" /></CardHeader></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardDescription>Acessos ao n8n pendentes</CardDescription><CardTitle className="text-3xl">{data.requests ? pendingRequests : "—"}</CardTitle></div><Badge variant={pendingRequests ? "default" : "secondary"}>{pendingRequests ? "Aguardando" : "Em dia"}</Badge></CardHeader></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]">
        <Card><CardHeader className="flex flex-row items-start justify-between gap-3"><div><CardTitle>Uso da API</CardTitle><CardDescription>Requisições feitas com as suas chaves nos últimos {DAYS} dias.</CardDescription></div><Button variant="outline" size="sm" onClick={() => onOpen("api-keys")}>Gerenciar chaves</Button></CardHeader>
          <CardContent>{data.usage ? <ChartContainer config={usageChartConfig} className="h-[16rem]" aria-label="Gráfico de área com as requisições da API por dia">
            <AreaChart data={chart} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="4 4" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={10} minTickGap={18} />
              <YAxis allowDecimals={false} domain={[0, "auto"]} tickLine={false} axisLine={false} width={40} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent formatter={value => String(value)} />} />
              <Area type="linear" dataKey="requests" name="Requisições" stroke="var(--color-requests)" strokeWidth={2.5} fill="var(--color-requests)" fillOpacity={0.25} dot={{ r: 3 }} activeDot={{ r: 6 }} isAnimationActive={false} />
            </AreaChart></ChartContainer> : unavailable}</CardContent></Card>

        <Card><CardHeader className="flex flex-row items-start justify-between gap-3"><div><CardTitle>Bancos de dados</CardTitle><CardDescription>Estado das instâncias usadas pela Nexo.</CardDescription></div><Button variant="outline" size="sm" onClick={() => onOpen("databases")}>Abrir</Button></CardHeader>
          <CardContent>{data.instances ? <ul className="flex flex-col gap-3">{data.instances.map(item => <li key={item.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <span className="flex items-center gap-2 text-sm font-medium"><Database className="size-4 text-primary" />{item.name}</span>
            <Badge variant={STATUS[item.status].variant}>{STATUS[item.status].label}</Badge></li>)}</ul> : unavailable}</CardContent></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader className="flex flex-row items-start justify-between gap-3"><div><CardTitle>Chaves de API</CardTitle><CardDescription>As mais usadas recentemente.</CardDescription></div><Button variant="outline" size="sm" onClick={() => onOpen("api-keys")}>Ver todas</Button></CardHeader>
          <CardContent>{!data.keys ? unavailable : keysByRecentUse.length ? <ul className="flex flex-col gap-3">{keysByRecentUse.slice(0, 5).map(key => <li key={key.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
            <div className="min-w-0"><p className="truncate text-sm font-medium">{key.name}</p><p className="font-mono text-xs text-muted-foreground">{key.key_prefix}…</p></div>
            <span className="text-xs text-muted-foreground">{key.last_used_at ? `Usada em ${dateLabel(key.last_used_at)}` : "Nunca usada"}</span></li>)}</ul>
            : <Empty><EmptyHeader><EmptyMedia variant="icon"><KeyRound /></EmptyMedia><EmptyTitle>Nenhuma chave ainda</EmptyTitle><EmptyDescription>Crie uma chave para integrar o n8n, o MCP ou seus próprios scripts.</EmptyDescription></EmptyHeader></Empty>}</CardContent></Card>

        <Card><CardHeader className="flex flex-row items-start justify-between gap-3"><div><CardTitle>Automações recentes</CardTitle><CardDescription>Os últimos fluxos adicionados à biblioteca.</CardDescription></div><Button variant="outline" size="sm" onClick={() => onOpen("automations")}>Abrir biblioteca</Button></CardHeader>
          <CardContent>{!data.automations ? unavailable : recentAutomations.length ? <ul className="flex flex-col gap-3">{recentAutomations.map(item => <li key={item.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="truncate text-sm font-medium">{item.name}</p><span className="text-xs text-muted-foreground">{dateLabel(item.created_at)}</span></div>
            <p className="line-clamp-2 text-xs text-muted-foreground">{item.description}</p><p className="mt-1 text-xs text-muted-foreground">Por {item.created_by_name}</p></li>)}</ul>
            : <Empty><EmptyHeader><EmptyMedia variant="icon"><Workflow /></EmptyMedia><EmptyTitle>Biblioteca vazia</EmptyTitle><EmptyDescription>As automações compartilhadas pela equipe aparecerão aqui.</EmptyDescription></EmptyHeader></Empty>}</CardContent></Card>
      </div>
    </>}
  </section>;
}
