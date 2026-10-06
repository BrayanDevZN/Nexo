import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Building2, CalendarDays, RefreshCw, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PIPELINE_STAGES, type ClientRecord, type PipelineStage, type createApi } from "./api";
import { Feedback, Loading, message } from "./shared";

type Period = "30" | "90" | "365" | "all";
type Bucket = { key: string; label: string; leads: number; won: number };
type MemberMetric = { id: string; name: string; leads: number; won: number; value: number };

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const shortDate = (value: string) => new Date(value).toLocaleDateString("pt-BR");

export function BusinessDashboard({ api }: { api: ReturnType<typeof createApi> }) {
  const [rows, setRows] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<Period>("90");
  const [stage, setStage] = useState<PipelineStage | "all">("all");
  const [selectedMember, setSelectedMember] = useState<string | "all">("all");
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const all: ClientRecord[] = [];
      for (let offset = 0; ; offset += 100) {
        const page = await api.request<ClientRecord[]>(`/clients?limit=100&offset=${offset}`);
        all.push(...page);
        if (page.length < 100) break;
      }
      setRows(all);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const now = new Date();
    const cutoff = period === "all" ? null : new Date(now.getTime() - Number(period) * 24 * 60 * 60 * 1000);
    return rows.filter(row => {
      const created = new Date(row.created_at);
      const matchesPeriod = !cutoff || created >= cutoff;
      const matchesStage = stage === "all" || row.pipeline_stage === stage;
      return matchesPeriod && matchesStage;
    });
  }, [rows, period, stage]);

  const members = useMemo<MemberMetric[]>(() => {
    const grouped = new Map<string, MemberMetric>();
    for (const row of filtered) {
      const item = grouped.get(row.created_by_id) || {
        id: row.created_by_id, name: row.created_by_name || "Membro removido", leads: 0, won: 0, value: 0,
      };
      item.leads += 1;
      if (row.pipeline_stage === "won" || row.contract_closed) {
        item.won += 1;
        item.value += row.contract_value || 0;
      }
      grouped.set(row.created_by_id, item);
    }
    return [...grouped.values()].sort((a, b) => b.leads - a.leads || a.name.localeCompare(b.name, "pt-BR"));
  }, [filtered]);

  const buckets = useMemo<Bucket[]>(() => {
    const now = new Date();
    const count = period === "30" ? 5 : period === "90" ? 4 : 12;
    const monthCount = period === "all" ? 12 : period === "365" ? 12 : period === "90" ? 3 : 0;
    let result: Bucket[];
    if (monthCount) {
      result = Array.from({ length: monthCount }, (_, index) => {
        const date = new Date(now.getFullYear(), now.getMonth() - monthCount + 1 + index, 1);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        return { key, label: date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""), leads: 0, won: 0 };
      });
      for (const row of filtered) {
        const date = new Date(row.created_at);
        const bucket = result.find(item => item.key === `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
        if (bucket) { bucket.leads += 1; if (row.pipeline_stage === "won" || row.contract_closed) bucket.won += 1; }
      }
    } else {
      result = Array.from({ length: count }, (_, index) => ({
        key: `week-${index}`, label: `Dia ${index * 7 + 1}–${Math.min(30, index * 7 + 7)}`, leads: 0, won: 0,
      }));
      const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      for (const row of filtered) {
        const elapsed = new Date(row.created_at).getTime() - cutoff.getTime();
        const index = Math.min(count - 1, Math.max(0, Math.floor(elapsed / (30 * 24 * 60 * 60 * 1000) * count)));
        result[index].leads += 1;
        if (row.pipeline_stage === "won" || row.contract_closed) result[index].won += 1;
      }
    }
    return result;
  }, [filtered, period]);

  const drillRows = useMemo(() => filtered.filter(row =>
    (selectedMember === "all" || row.created_by_id === selectedMember) &&
    (!selectedBucket || (selectedBucket.startsWith("week-")
      ? (() => { const index = Number(selectedBucket.slice(5)); const cutoff = new Date(Date.now() - 30 * 86400000); const created = new Date(row.created_at); return created >= new Date(cutoff.getTime() + index * 7 * 86400000) && created < new Date(cutoff.getTime() + (index + 1) * 7 * 86400000); })()
      : row.created_at.slice(0, 7) === selectedBucket)),
  ), [filtered, selectedMember, selectedBucket]);

  const maxLeads = Math.max(1, ...buckets.map(item => item.leads));
  const maxMemberLeads = Math.max(1, ...members.map(item => item.leads));
  const wonCount = filtered.filter(row => row.pipeline_stage === "won" || row.contract_closed).length;
  const pipelineValue = filtered.reduce((total, row) => total + (row.contract_value || 0), 0);
  const closedValue = filtered.filter(row => row.pipeline_stage === "won" || row.contract_closed)
    .reduce((total, row) => total + (row.contract_value || 0), 0);
  const selectedMemberName = members.find(member => member.id === selectedMember)?.name;

  function selectMember(id: string) {
    setSelectedMember(id);
    setSelectedBucket(null);
  }

  return <section className="flex flex-col gap-6" aria-labelledby="business-dashboard-title">
    <div className="admin-section-head">
      <div><span className="admin-eyebrow">INTELIGÊNCIA COMERCIAL</span><h1 id="business-dashboard-title">Dashboard do negócio</h1><p>Acompanhe oportunidades, fechamentos e resultado por membro da equipe.</p></div>
      <Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw data-icon="inline-start" /> Atualizar</Button>
    </div>
    <Feedback error={error} />
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-2"><label htmlFor="business-period" className="text-sm font-medium">Período</label><NativeSelect id="business-period" value={period} onChange={event => { setPeriod(event.target.value as Period); setSelectedBucket(null); }}><NativeSelectOption value="30">Últimos 30 dias</NativeSelectOption><NativeSelectOption value="90">Últimos 90 dias</NativeSelectOption><NativeSelectOption value="365">Últimos 12 meses</NativeSelectOption><NativeSelectOption value="all">Todo o período</NativeSelectOption></NativeSelect></div>
      <div className="flex flex-col gap-2"><label htmlFor="business-stage" className="text-sm font-medium">Etapa do funil</label><NativeSelect id="business-stage" value={stage} onChange={event => setStage(event.target.value as PipelineStage | "all")}><NativeSelectOption value="all">Todas as etapas</NativeSelectOption>{PIPELINE_STAGES.map(item => <NativeSelectOption key={item.value} value={item.value}>{item.label}</NativeSelectOption>)}</NativeSelect></div>
      {(selectedMember !== "all" || selectedBucket) && <Button variant="ghost" onClick={() => { setSelectedMember("all"); setSelectedBucket(null); }}>Limpar drill-down</Button>}
    </div>

    {loading && !rows.length ? <Loading /> : <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardDescription>Oportunidades no período</CardDescription><CardTitle className="text-2xl">{filtered.length}</CardTitle></div><Building2 className="size-5 text-primary" /></CardHeader></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardDescription>Contratos ganhos</CardDescription><CardTitle className="text-2xl">{wonCount}</CardTitle></div><Activity className="size-5 text-primary" /></CardHeader></Card>
        <Card><CardHeader><CardDescription>Valor potencial no funil</CardDescription><CardTitle className="text-xl">{currency(pipelineValue)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Valor fechado</CardDescription><CardTitle className="text-xl">{currency(closedValue)}</CardTitle></CardHeader></Card>
      </div>

      <Tabs defaultValue="timeline" className="flex flex-col gap-4">
        <TabsList aria-label="Visualizações do dashboard"><TabsTrigger value="timeline">Evolução</TabsTrigger><TabsTrigger value="members">Por membro</TabsTrigger></TabsList>
        <TabsContent value="timeline">
          <Card>
            <CardHeader><CardTitle>Oportunidades ao longo do tempo</CardTitle><CardDescription>Clique em uma coluna para abrir os registros daquele período. As colunas escuras mostram contratos ganhos.</CardDescription></CardHeader>
            <CardContent>
              <div className="flex h-64 items-end gap-2 overflow-x-auto border-b px-2 pb-2 sm:gap-4" role="group" aria-label="Gráfico de oportunidades e contratos ganhos">
                {buckets.map(bucket => <button key={bucket.key} type="button" onClick={() => setSelectedBucket(selectedBucket === bucket.key ? null : bucket.key)} aria-pressed={selectedBucket === bucket.key} aria-label={`${bucket.label}: ${bucket.leads} oportunidades, ${bucket.won} ganhos. Abrir detalhes`} className="group flex h-full min-w-12 flex-1 flex-col items-center justify-end gap-2 rounded-t-md px-1 text-xs hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="font-medium tabular-nums">{bucket.leads}</span>
                  <span className="flex h-[78%] w-full items-end justify-center gap-1">
                    <span className="w-1/2 rounded-t bg-primary/45 transition-[height] group-hover:bg-primary/65" style={{ height: `${Math.max(bucket.leads ? 8 : 2, bucket.leads / maxLeads * 100)}%` }} />
                    <span className="w-1/2 rounded-t bg-primary transition-[height] group-hover:opacity-80" style={{ height: `${Math.max(bucket.won ? 8 : 2, bucket.won / maxLeads * 100)}%` }} />
                  </span>
                  <span className="truncate text-muted-foreground">{bucket.label}</span>
                </button>)}
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-2"><span className="size-2 rounded-sm bg-primary/45" /> Oportunidades</span><span className="flex items-center gap-2"><span className="size-2 rounded-sm bg-primary" /> Ganhos</span></div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="members">
          <Card>
            <CardHeader><CardTitle>Resultado por membro da equipe</CardTitle><CardDescription>Selecione uma pessoa para detalhar as oportunidades que ela cadastrou.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-4">
              {members.length ? members.map(member => <button key={member.id} type="button" onClick={() => selectMember(selectedMember === member.id ? "all" : member.id)} aria-pressed={selectedMember === member.id} className="grid gap-2 rounded-lg p-2 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(9rem,1fr)_minmax(8rem,2fr)_auto] sm:items-center">
                <span className="truncate font-medium">{member.name}</span>
                <span className="flex h-8 items-end gap-1" aria-hidden="true"><span className="h-full rounded-sm bg-primary/40" style={{ width: `${Math.max(4, member.leads / maxMemberLeads * 100)}%` }} /><span className="h-full rounded-sm bg-primary" style={{ width: `${Math.max(member.won ? 4 : 0, member.won / maxMemberLeads * 100)}%` }} /></span>
                <span className="flex flex-wrap gap-2"><Badge variant="secondary">{member.leads} oportunidades</Badge><Badge>{member.won} ganhos · {currency(member.value)}</Badge></span>
              </button>) : <Empty><EmptyHeader><EmptyMedia variant="icon"><Users /></EmptyMedia><EmptyTitle>Sem dados no período</EmptyTitle><EmptyDescription>Cadastre oportunidades ou selecione um período maior.</EmptyDescription></EmptyHeader></Empty>}
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-2"><span className="size-2 rounded-sm bg-primary/40" /> Oportunidades</span><span className="flex items-center gap-2"><span className="size-2 rounded-sm bg-primary" /> Contratos ganhos</span></div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader className="flex flex-wrap flex-row items-start justify-between gap-3">
          <div><CardTitle>Detalhamento</CardTitle><CardDescription>{selectedMemberName ? `Oportunidades cadastradas por ${selectedMemberName}` : selectedBucket ? `Registros de ${buckets.find(item => item.key === selectedBucket)?.label || "período selecionado"}` : "Registros correspondentes aos filtros acima."}</CardDescription></div>
          <Badge variant="outline"><CalendarDays data-icon="inline-start" /> {drillRows.length} registros</Badge>
        </CardHeader>
        <CardContent>
          {drillRows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[42rem] text-left text-sm"><thead><tr className="border-b text-muted-foreground"><th className="p-3 font-medium">Oportunidade</th><th className="p-3 font-medium">Responsável</th><th className="p-3 font-medium">Etapa</th><th className="p-3 font-medium">Valor</th><th className="p-3 font-medium">Criado em</th></tr></thead><tbody>{drillRows.map(row => <tr key={row.id} className="border-b last:border-0"><td className="p-3"><span className="font-medium">{row.name}</span><span className="block text-xs text-muted-foreground">{row.niche}</span></td><td className="p-3">{row.created_by_name}</td><td className="p-3"><Badge variant={row.pipeline_stage === "won" ? "default" : row.pipeline_stage === "lost" ? "destructive" : "secondary"}>{PIPELINE_STAGES.find(item => item.value === row.pipeline_stage)?.label || row.pipeline_stage}</Badge></td><td className="p-3 tabular-nums">{row.contract_value == null ? "—" : currency(row.contract_value)}</td><td className="p-3 whitespace-nowrap">{shortDate(row.created_at)}</td></tr>)}</tbody></table></div> : <Empty><EmptyHeader><EmptyMedia variant="icon"><Building2 /></EmptyMedia><EmptyTitle>Nenhuma oportunidade encontrada</EmptyTitle><EmptyDescription>Os registros que correspondem aos filtros e ao drill-down aparecerão aqui.</EmptyDescription></EmptyHeader></Empty>}
        </CardContent>
      </Card>
    </>}
  </section>;
}
