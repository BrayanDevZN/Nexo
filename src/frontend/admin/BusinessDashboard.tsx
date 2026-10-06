import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, CalendarDays, ChevronLeft, RefreshCw, TrendingUp, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Area, AreaChart as RechartsAreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";
import { PIPELINE_STAGES, type ClientRecord, type createApi } from "./api";
import { Feedback, Loading, message } from "./shared";

type ViewPeriod = { year?: number; month?: number };
type Point = { key: string; label: string; value: number; contracts: number; year?: number; month?: number; day?: number };
type GroupMetric = { id: string; label: string; contracts: number; value: number };
type ContractMetric = { id: string; name: string; niche: string; member: string; value: number; closedAt: Date };
type TeamMember = { id: string; name: string };

const currency = (value: number | string) =>
  Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const compactCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(value);
const monthLabel = (year: number, month: number) =>
  new Date(year, month, 1).toLocaleDateString("pt-BR", { month: "long" });
const isWon = (row: ClientRecord) => row.contract_closed || row.pipeline_stage === "won";
const closedAt = (row: ClientRecord) => new Date(row.contract_closed_at || row.updated_at);

const salesChartConfig = { value: { label: "Vendas", color: "var(--primary)" } };
const rankChartConfig = { value: { label: "Faturamento", color: "var(--primary)" } };

function AreaChart({ points, canDrill, onDrill }: {
  points: Point[];
  canDrill: boolean;
  onDrill: (point: Point) => void;
}) {
  return <div className="min-w-0">
    <ChartContainer config={salesChartConfig} className={canDrill ? "h-[19rem] cursor-pointer" : "h-[19rem]"} aria-label="Gráfico de área de vendas ao longo do tempo">
      <RechartsAreaChart data={points} margin={{ top: 12, right: 16, left: 12, bottom: 0 }} onClick={event => {
        const rawIndex = event?.activeTooltipIndex ?? event?.activeIndex;
        const index = typeof rawIndex === "number" ? rawIndex : Number(rawIndex);
        const point = Number.isInteger(index) ? points[index] : undefined;
        if (canDrill && point) onDrill(point);
      }}>
        <CartesianGrid vertical={false} strokeDasharray="4 4" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} minTickGap={18} />
        <YAxis domain={[0, "auto"]} tickLine={false} axisLine={false} tickFormatter={compactCurrency} width={76} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent formatter={value => currency(value)} />} />
        <Area type="linear" dataKey="value" name="Vendas" stroke="var(--color-value)" strokeWidth={2.5} fill="var(--color-value)" fillOpacity={0.3} dot={canDrill ? { r: 4, cursor: "pointer" } : { r: 3 }} activeDot={{ r: 7, cursor: canDrill ? "pointer" : "default" }} isAnimationActive={false} />
      </RechartsAreaChart>
    </ChartContainer>
    {canDrill && <p className="mt-1 text-xs text-muted-foreground">Clique em um ano para abrir os meses; depois clique em um mês para abrir os dias.</p>}
  </div>;
}

function RankedBars({ title, description, icon, rows, selectedId, onSelect, emptyLabel }: {
  title: string;
  description: string;
  icon: React.ReactNode;
  rows: GroupMetric[];
  selectedId: string;
  onSelect: (id: string) => void;
  emptyLabel: string;
}) {
  return <Card>
    <CardHeader><div className="flex items-center gap-2">{icon}<CardTitle>{title}</CardTitle></div><CardDescription>{description}</CardDescription></CardHeader>
    <CardContent>
      {rows.length ? <ChartContainer config={rankChartConfig} className="h-[20rem]" aria-label={`${title}, gráfico de colunas`}>
        <BarChart data={rows} margin={{ top: 34, right: 18, bottom: 18, left: 8 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} interval={0} tick={{ fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} tickFormatter={compactCurrency} width={76} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent formatter={value => currency(value)} />} />
          <Bar dataKey="value" name="Faturamento" fill="var(--color-value)" radius={[5, 5, 0, 0]} maxBarSize={72} minPointSize={3} isAnimationActive={false} onClick={entry => {
            const item = entry as unknown as { payload?: GroupMetric };
            if (item.payload) onSelect(selectedId === item.payload.id ? "all" : item.payload.id);
          }}>
            {rows.map(row => <Cell key={row.id} fill="var(--color-value)" fillOpacity={selectedId === "all" || selectedId === row.id ? 1 : 0.38} />)}
            <LabelList dataKey="value" position="top" formatter={value => compactCurrency(Number(value ?? 0))} className="fill-foreground text-[11px] font-medium" />
          </Bar>
        </BarChart>
      </ChartContainer> : <Empty><EmptyHeader><EmptyMedia variant="icon">{icon}</EmptyMedia><EmptyTitle>Sem vendas no período</EmptyTitle><EmptyDescription>{emptyLabel}</EmptyDescription></EmptyHeader></Empty>}
      {rows.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Selecione uma barra para cruzar esse resultado nos outros gráficos. {rows.map(row => `${row.label}: ${row.contracts} contratos`).join(" · ")}</p>}
    </CardContent>
  </Card>;
}

export function BusinessDashboard({ api }: { api: ReturnType<typeof createApi> }) {
  const [rows, setRows] = useState<ClientRecord[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<ViewPeriod>({});
  const [selectedMember, setSelectedMember] = useState("all");
  const [selectedNiche, setSelectedNiche] = useState("all");
  const [selectedContract, setSelectedContract] = useState("all");

  const load = useCallback(async () => {
    api.invalidate();
    setLoading(true);
    setError("");
    try {
      const all: ClientRecord[] = [];
      for (let offset = 0; ; offset += 100) {
        const page = await api.request<ClientRecord[]>(
          "/clients?limit=100&offset=" + offset,
        );
        all.push(...page);
        if (page.length < 100) break;
      }
      const allMembers: TeamMember[] = [];
      for (let offset = 0; ; offset += 100) {
        const page = await api.request<TeamMember[]>(
          "/members?limit=100&offset=" + offset,
        );
        allMembers.push(...page);
        if (page.length < 100) break;
      }
      setRows(all);
      setTeamMembers(allMembers);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const sales = useMemo(() => rows.filter(isWon), [rows]);
  const years = useMemo(() => {
    const available = sales.map(row => closedAt(row).getFullYear()).filter(Number.isFinite);
    const current = new Date().getFullYear();
    const first = available.length ? Math.min(...available, current) : current - 3;
    const last = available.length ? Math.max(...available, current) : current;
    return Array.from({ length: last - first + 1 }, (_, index) => first + index);
  }, [sales]);

  const timeSales = useMemo(() => sales.filter(row => {
    const date = closedAt(row);
    return (period.year === undefined || date.getFullYear() === period.year) &&
      (period.month === undefined || date.getMonth() === period.month);
  }), [sales, period]);

  const filteredSales = useMemo(() => timeSales.filter(row =>
    (selectedMember === "all" || row.created_by_id === selectedMember) &&
    (selectedNiche === "all" || row.niche === selectedNiche) &&
    (selectedContract === "all" || row.id === selectedContract)
  ), [timeSales, selectedMember, selectedNiche, selectedContract]);

  const memberChartSales = useMemo(() => timeSales.filter(row =>
    (selectedNiche === "all" || row.niche === selectedNiche) &&
    (selectedContract === "all" || row.id === selectedContract)
  ), [timeSales, selectedNiche, selectedContract]);

  const nicheChartSales = useMemo(() => timeSales.filter(row =>
    (selectedMember === "all" || row.created_by_id === selectedMember) &&
    (selectedContract === "all" || row.id === selectedContract)
  ), [timeSales, selectedMember, selectedContract]);

  const contractChartSales = useMemo(() => timeSales.filter(row =>
    (selectedMember === "all" || row.created_by_id === selectedMember) &&
    (selectedNiche === "all" || row.niche === selectedNiche)
  ), [timeSales, selectedMember, selectedNiche]);

  const recentClients = useMemo(() => [...rows]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 50), [rows]);

  const timeline = useMemo<Point[]>(() => {
    let definitions: { key: string; label: string; year?: number; month?: number; day?: number }[];
    if (period.year === undefined) {
      definitions = years.map(year => ({ key: String(year), label: String(year), year }));
    } else if (period.month === undefined) {
      definitions = Array.from({ length: 12 }, (_, month) => ({
        key: String(month),
        label: new Date(period.year!, month, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
        month,
      }));
    } else {
      const days = new Date(period.year!, period.month + 1, 0).getDate();
      definitions = Array.from({ length: days }, (_, index) => ({
        key: String(index + 1), label: String(index + 1), day: index + 1,
      }));
    }
    return definitions.map(definition => {
      const matching = filteredSales.filter(row => {
        const date = closedAt(row);
        return definition.year !== undefined ? date.getFullYear() === definition.year
          : definition.month !== undefined ? date.getMonth() === definition.month
          : definition.day !== undefined ? date.getDate() === definition.day : true;
      });
      return {
        ...definition,
        value: matching.reduce((sum, row) => sum + Number(row.contract_value || 0), 0),
        contracts: matching.length,
      };
    });
  }, [filteredSales, period, years]);

  const members = useMemo(() => {
    const grouped = new Map<string, GroupMetric>();
    for (const member of teamMembers) {
      grouped.set(member.id, { id: member.id, label: member.name, contracts: 0, value: 0 });
    }
    for (const row of memberChartSales) {
      const item = grouped.get(row.created_by_id) || {
        id: row.created_by_id, label: row.created_by_name || "Membro removido", contracts: 0, value: 0,
      };
      item.contracts += 1;
      item.value += Number(row.contract_value || 0);
      grouped.set(row.created_by_id, item);
    }
    return [...grouped.values()].sort((a, b) => b.value - a.value || b.contracts - a.contracts || a.label.localeCompare(b.label, "pt-BR"));
  }, [memberChartSales, teamMembers]);

  const niches = useMemo(() => {
    const grouped = new Map<string, GroupMetric>();
    for (const row of nicheChartSales) {
      const id = row.niche || "Sem nicho";
      const item = grouped.get(id) || { id, label: id, contracts: 0, value: 0 };
      item.contracts += 1;
      item.value += Number(row.contract_value || 0);
      grouped.set(id, item);
    }
    return [...grouped.values()].sort((a, b) => b.value - a.value || b.contracts - a.contracts).slice(0, 8);
  }, [nicheChartSales]);

  const topContracts = useMemo<ContractMetric[]>(() => [...contractChartSales].map(row => ({
    id: row.id, name: row.name, niche: row.niche,
    member: row.created_by_name || "Membro removido",
    value: Number(row.contract_value || 0), closedAt: closedAt(row),
  })).sort((a, b) => b.value - a.value || b.closedAt.getTime() - a.closedAt.getTime()).slice(0, 10), [contractChartSales]);

  const totalValue = filteredSales.reduce((sum, row) => sum + Number(row.contract_value || 0), 0);
  const averageValue = filteredSales.length ? totalValue / filteredSales.length : 0;
  const selectedMemberName = members.find(row => row.id === selectedMember)?.label;
  const selectedNicheName = niches.find(row => row.id === selectedNiche)?.label;
  const canDrill = period.month === undefined;

  function drill(point: Point) {
    if (period.year === undefined && point.year !== undefined) {
      setPeriod({ year: point.year });
    } else if (period.year !== undefined && period.month === undefined && point.month !== undefined) {
      setPeriod({ year: period.year, month: point.month });
    }
  }

  function selectYear(value: string) {
    setPeriod(value === "all" ? {} : { year: Number(value) });
    clearDimensions();
  }

  function clearDimensions() {
    setSelectedMember("all");
    setSelectedNiche("all");
    setSelectedContract("all");
  }

  function clearAll() {
    setPeriod({});
    clearDimensions();
  }

  const periodTitle = period.year === undefined ? "Todos os anos"
    : period.month !== undefined ? monthLabel(period.year, period.month) + " de " + period.year
      : "Ano de " + period.year;
  const details = [...filteredSales].sort((a, b) =>
    closedAt(b).getTime() - closedAt(a).getTime());

  return <section className="flex flex-col gap-6" aria-labelledby="business-dashboard-title">
    <div className="admin-section-head">
      <div><span className="admin-eyebrow">INTELIGÊNCIA COMERCIAL</span><h1 id="business-dashboard-title">Dashboard do negócio</h1><p>Vendas fechadas, receita e desempenho da equipe.</p></div>
      <Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw data-icon="inline-start" /> Atualizar</Button>
    </div>
    <Feedback error={error} />
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-2"><label htmlFor="business-year" className="text-sm font-medium">Período</label><NativeSelect id="business-year" value={period.year === undefined ? "all" : String(period.year)} onChange={event => selectYear(event.target.value)}><NativeSelectOption value="all">Todos os anos</NativeSelectOption>{[...years].reverse().map(year => <NativeSelectOption key={year} value={String(year)}>{year}</NativeSelectOption>)}</NativeSelect></div>
        {period.year !== undefined && <Button variant="ghost" onClick={() => setPeriod({})}><ChevronLeft data-icon="inline-start" /> Todos os anos</Button>}
        {period.year !== undefined && <Badge variant="secondary">{period.year}</Badge>}
        {period.month !== undefined && <Button variant="ghost" onClick={() => setPeriod({ year: period.year })}><ChevronLeft data-icon="inline-start" /> Voltar ao ano</Button>}
        {period.month !== undefined && <Badge variant="secondary">{monthLabel(period.year!, period.month)}</Badge>}
      </div>
      {(period.year !== undefined || period.month !== undefined || selectedMember !== "all" || selectedNiche !== "all" || selectedContract !== "all") &&
        <Button variant="outline" onClick={clearAll}>Limpar drill-down</Button>}
    </div>

    {loading && !rows.length ? <Loading /> : <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card><CardHeader><CardDescription>Faturamento no período</CardDescription><CardTitle className="text-2xl">{currency(totalValue)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Contratos fechados</CardDescription><CardTitle className="text-2xl">{filteredSales.length}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Ticket médio</CardDescription><CardTitle className="text-xl">{currency(averageValue)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Clientes cadastrados</CardDescription><CardTitle className="text-2xl">{rows.length}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Período selecionado</CardDescription><CardTitle className="text-xl">{periodTitle}</CardTitle></CardHeader></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap flex-row items-start justify-between gap-3">
          <div><CardTitle className="flex items-center gap-2">{period.year !== undefined && <Button variant="ghost" size="icon-sm" aria-label={period.month !== undefined ? "Voltar para os meses" : "Voltar para os anos"} title={period.month !== undefined ? "Voltar para os meses" : "Voltar para os anos"} onClick={() => setPeriod(period.month !== undefined ? { year: period.year } : {})}><ChevronLeft /></Button>}<TrendingUp /> Vendas ao longo do tempo</CardTitle><CardDescription>Receita dos contratos fechados. Comece pelos anos, clique em um ano para ver os meses e depois em um mês para ver os dias.</CardDescription></div>
          <Badge variant="outline"><CalendarDays data-icon="inline-start" /> {periodTitle}</Badge>
        </CardHeader>
        <CardContent><AreaChart points={timeline} canDrill={canDrill} onDrill={drill} />
          <p className="mt-3 text-xs text-muted-foreground">Para contratos fechados antes deste registro de data, usamos a última atualização disponível como aproximação.</p>
        </CardContent>
      </Card>

      {(selectedMemberName || selectedNicheName || selectedContract !== "all") && <div className="flex flex-wrap items-center gap-2" aria-label="Filtros do drill-down">
        <span className="text-sm text-muted-foreground">Aplicado a todos os gráficos:</span>
        {selectedMemberName && <Badge variant="secondary">Membro: {selectedMemberName}</Badge>}
        {selectedNicheName && <Badge variant="secondary">Nicho: {selectedNicheName}</Badge>}
        {selectedContract !== "all" && <Badge variant="secondary">Contrato selecionado</Badge>}
        <Button variant="ghost" size="sm" onClick={clearDimensions}>Limpar filtros</Button>
      </div>}

      <div className="flex flex-col gap-4">
        <RankedBars title="Vendas por membro" description="Cada coluna representa um membro aprovado, incluindo quem ainda não realizou vendas." icon={<Users className="text-primary" />} rows={members} selectedId={selectedMember} onSelect={setSelectedMember} emptyLabel="Os membros aprovados aparecerão aqui, mesmo antes da primeira venda." />
        <RankedBars title="Vendas por nicho" description="Nichos que geraram mais receita no período." icon={<Building2 className="text-primary" />} rows={niches} selectedId={selectedNiche} onSelect={setSelectedNiche} emptyLabel="Os nichos com contratos fechados aparecerão aqui." />
        <Card>
          <CardHeader><CardTitle>Contratos que mais faturaram</CardTitle><CardDescription>Colunas por contrato. Clique em uma coluna para cruzar o resultado nos outros gráficos.</CardDescription></CardHeader>
          <CardContent>
            {topContracts.length ? <ChartContainer config={rankChartConfig} className="h-[24rem] min-w-0" aria-label="Gráfico de colunas dos contratos que mais faturaram">
              <BarChart data={topContracts} margin={{ top: 12, right: 12, bottom: 70, left: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="name" interval={0} angle={-28} textAnchor="end" height={88} tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={compactCurrency} width={76} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent formatter={value => currency(value)} />} />
                <Bar dataKey="value" name="Faturamento" fill="var(--color-value)" radius={[5, 5, 0, 0]} isAnimationActive={false} onClick={entry => {
                  const item = entry as unknown as { payload?: ContractMetric };
                  if (item.payload) setSelectedContract(selectedContract === item.payload.id ? "all" : item.payload.id);
                }} />
              </BarChart>
            </ChartContainer> : <Empty><EmptyHeader><EmptyMedia variant="icon"><Building2 /></EmptyMedia><EmptyTitle>Nenhum contrato fechado</EmptyTitle><EmptyDescription>Os contratos de maior valor aparecerão aqui.</EmptyDescription></EmptyHeader></Empty>}
            {!!topContracts.length && <div className="mt-3 grid gap-x-4 gap-y-2 text-xs text-muted-foreground sm:grid-cols-2">{topContracts.map(contract => <button type="button" key={contract.id} onClick={() => setSelectedContract(selectedContract === contract.id ? "all" : contract.id)} className="flex min-w-0 items-center justify-between gap-2 rounded px-1 py-1 text-left hover:bg-muted/50" aria-pressed={selectedContract === contract.id}><span className="truncate">{contract.name} · {contract.member}</span><span className="shrink-0">{currency(contract.value)}</span></button>)}</div>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap flex-row items-start justify-between gap-3">
          <div><CardTitle>Clientes recentes</CardTitle><CardDescription>Últimos {Math.min(50, rows.length)} cadastros do CRM, sem depender do período dos gráficos. As vendas acima consideram apenas contratos fechados.</CardDescription></div>
          <Badge variant="outline">{rows.length} clientes no CRM</Badge>
        </CardHeader>
        <CardContent>
          {recentClients.length ? <div className="overflow-x-auto"><table className="w-full min-w-[48rem] text-left text-sm"><thead><tr className="border-b text-muted-foreground"><th className="p-3 font-medium">Cliente</th><th className="p-3 font-medium">Responsável</th><th className="p-3 font-medium">Nicho</th><th className="p-3 font-medium">Etapa</th><th className="p-3 font-medium">Criado em</th><th className="p-3 text-right font-medium">Valor</th></tr></thead><tbody>{recentClients.map(row => <tr key={row.id} className="border-b last:border-0"><td className="p-3 font-medium">{row.name}</td><td className="p-3">{row.created_by_name}</td><td className="p-3">{row.niche}</td><td className="p-3"><Badge variant={row.pipeline_stage === "won" ? "default" : row.pipeline_stage === "lost" ? "destructive" : "secondary"}>{PIPELINE_STAGES.find(stage => stage.value === row.pipeline_stage)?.label || row.pipeline_stage}</Badge></td><td className="p-3 whitespace-nowrap">{new Date(row.created_at).toLocaleDateString("pt-BR")}</td><td className="p-3 text-right tabular-nums">{row.contract_value == null ? "—" : currency(row.contract_value)}</td></tr>)}</tbody></table></div>
            : <Empty><EmptyHeader><EmptyMedia variant="icon"><Building2 /></EmptyMedia><EmptyTitle>Nenhum cliente cadastrado</EmptyTitle><EmptyDescription>Os clientes salvos no CRM aparecerão aqui, sem depender do período selecionado.</EmptyDescription></EmptyHeader></Empty>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-wrap flex-row items-start justify-between gap-3">
          <div><CardTitle>Contratos no período</CardTitle><CardDescription>{filteredSales.length} contratos fechados em {periodTitle.toLowerCase()}, respeitando os filtros selecionados.</CardDescription></div>
          <Badge variant="outline">{currency(totalValue)} em vendas</Badge>
        </CardHeader>
        <CardContent>
          {details.length ? <div className="overflow-x-auto"><table className="w-full min-w-[44rem] text-left text-sm"><thead><tr className="border-b text-muted-foreground"><th className="p-3 font-medium">Contrato</th><th className="p-3 font-medium">Responsável</th><th className="p-3 font-medium">Nicho</th><th className="p-3 font-medium">Fechado em</th><th className="p-3 text-right font-medium">Valor</th></tr></thead><tbody>{details.map(row => <tr key={row.id} className="border-b last:border-0"><td className="p-3 font-medium">{row.name}</td><td className="p-3">{row.created_by_name}</td><td className="p-3">{row.niche}</td><td className="p-3 whitespace-nowrap">{closedAt(row).toLocaleDateString("pt-BR")}</td><td className="p-3 text-right tabular-nums">{row.contract_value == null ? "—" : currency(row.contract_value)}</td></tr>)}</tbody></table></div>
            : <Empty><EmptyHeader><EmptyMedia variant="icon"><Building2 /></EmptyMedia><EmptyTitle>Nenhuma venda neste período</EmptyTitle><EmptyDescription>Os contratos fechados que corresponderem ao período e aos filtros aparecerão aqui.</EmptyDescription></EmptyHeader></Empty>}
        </CardContent>
      </Card>
    </>}
  </section>;
}
