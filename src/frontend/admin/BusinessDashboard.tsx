import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, CalendarDays, ChevronLeft, RefreshCw, TrendingUp, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Area, AreaChart as RechartsAreaChart, Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import { PIPELINE_STAGES, type ClientRecord, type createApi } from "./api";
import { Feedback, Loading, message } from "./shared";

type ViewPeriod = { year: number; month?: number; day?: number };
type Point = { key: string; label: string; value: number; contracts: number; month?: number; day?: number };
type GroupMetric = { id: string; label: string; contracts: number; value: number };
type ContractMetric = { id: string; name: string; niche: string; member: string; value: number; closedAt: Date };

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
    <ChartContainer config={salesChartConfig} className="h-[19rem]" aria-label="Gráfico de área de vendas ao longo do tempo">
      <RechartsAreaChart data={points} margin={{ top: 12, right: 16, left: 12, bottom: 0 }} onClick={event => {
        const point = (event as unknown as { activePayload?: { payload?: Point }[] } | null)?.activePayload?.[0]?.payload;
        if (canDrill && point) onDrill(point);
      }}>
        <defs><linearGradient id="sales-area-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.42} /><stop offset="95%" stopColor="var(--color-value)" stopOpacity={0.03} /></linearGradient></defs>
        <CartesianGrid vertical={false} strokeDasharray="4 4" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} minTickGap={18} />
        <YAxis tickLine={false} axisLine={false} tickFormatter={compactCurrency} width={76} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent formatter={value => currency(value)} />} />
        <Area type="monotone" dataKey="value" name="Vendas" stroke="var(--color-value)" strokeWidth={3} fill="url(#sales-area-gradient)" activeDot={{ r: 6 }} isAnimationActive={false} />
      </RechartsAreaChart>
    </ChartContainer>
    {canDrill && <p className="mt-1 text-xs text-muted-foreground">Clique em um mês ou dia para sincronizar o detalhamento de todos os gráficos.</p>}
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
          <Bar dataKey="value" name="Faturamento" fill="var(--color-value)" radius={[5, 5, 0, 0]} maxBarSize={72} isAnimationActive={false} onClick={entry => {
            const item = entry as unknown as { payload?: GroupMetric };
            if (item.payload) onSelect(selectedId === item.payload.id ? "all" : item.payload.id);
          }}>
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<ViewPeriod>({ year: new Date().getFullYear() });
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
      setRows(all);
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
    const first = available.length ? Math.min(...available) : period.year - 3;
    return Array.from({ length: Math.max(1, period.year - first + 1) }, (_, index) => period.year - index);
  }, [sales, period.year]);

  const timeSales = useMemo(() => sales.filter(row => {
    const date = closedAt(row);
    return date.getFullYear() === period.year &&
      (period.month === undefined || date.getMonth() === period.month) &&
      (period.day === undefined || date.getDate() === period.day);
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
    let definitions: { key: string; label: string; month?: number; day?: number }[];
    if (period.month === undefined) {
      definitions = Array.from({ length: 12 }, (_, month) => ({
        key: String(month),
        label: new Date(period.year, month, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
        month,
      }));
    } else if (period.day === undefined) {
      const days = new Date(period.year, period.month + 1, 0).getDate();
      definitions = Array.from({ length: days }, (_, index) => ({
        key: String(index + 1), label: String(index + 1), day: index + 1,
      }));
    } else {
      definitions = [{
        key: String(period.day),
        label: new Date(period.year, period.month, period.day).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", ""),
        day: period.day,
      }];
    }
    return definitions.map(definition => {
      const matching = filteredSales.filter(row => {
        const date = closedAt(row);
        return definition.month !== undefined ? date.getMonth() === definition.month
          : definition.day !== undefined ? date.getDate() === definition.day : true;
      });
      return {
        ...definition,
        value: matching.reduce((sum, row) => sum + Number(row.contract_value || 0), 0),
        contracts: matching.length,
      };
    });
  }, [filteredSales, period]);

  const members = useMemo(() => {
    const grouped = new Map<string, GroupMetric>();
    for (const row of memberChartSales) {
      const item = grouped.get(row.created_by_id) || {
        id: row.created_by_id, label: row.created_by_name || "Membro removido", contracts: 0, value: 0,
      };
      item.contracts += 1;
      item.value += Number(row.contract_value || 0);
      grouped.set(row.created_by_id, item);
    }
    return [...grouped.values()].sort((a, b) => b.value - a.value || b.contracts - a.contracts);
  }, [memberChartSales]);

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
  const canDrill = period.day === undefined;

  function drill(point: Point) {
    if (period.month === undefined && point.month !== undefined) {
      setPeriod({ year: period.year, month: point.month });
    } else if (period.month !== undefined && period.day === undefined && point.day !== undefined) {
      setPeriod({ year: period.year, month: period.month, day: point.day });
    }
  }

  function selectYear(value: string) {
    setPeriod({ year: Number(value) });
    clearDimensions();
  }

  function clearDimensions() {
    setSelectedMember("all");
    setSelectedNiche("all");
    setSelectedContract("all");
  }

  function clearAll() {
    setPeriod({ year: new Date().getFullYear() });
    clearDimensions();
  }

  const periodTitle = period.day !== undefined
    ? new Date(period.year, period.month!, period.day).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
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
        <div className="flex flex-col gap-2"><label htmlFor="business-year" className="text-sm font-medium">Ano</label><NativeSelect id="business-year" value={String(period.year)} onChange={event => selectYear(event.target.value)}>{years.map(year => <NativeSelectOption key={year} value={String(year)}>{year}</NativeSelectOption>)}</NativeSelect></div>
        {period.month !== undefined && <Button variant="ghost" onClick={() => setPeriod({ year: period.year })}><ChevronLeft data-icon="inline-start" /> {period.year}</Button>}
        {period.month !== undefined && <Badge variant="secondary">{monthLabel(period.year, period.month)}</Badge>}
        {period.day !== undefined && <Button variant="ghost" onClick={() => setPeriod({ year: period.year, month: period.month })}><ChevronLeft data-icon="inline-start" /> Voltar ao mês</Button>}
      </div>
      {(period.month !== undefined || period.day !== undefined || selectedMember !== "all" || selectedNiche !== "all" || selectedContract !== "all") &&
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
          <div><CardTitle className="flex items-center gap-2"><TrendingUp /> Vendas ao longo do tempo</CardTitle><CardDescription>Receita dos contratos fechados. Clique nos meses para abrir os dias, e nos dias para filtrar o dashboard inteiro.</CardDescription></div>
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
        <RankedBars title="Vendas por membro" description="Receita e quantidade de contratos fechados." icon={<Users className="text-primary" />} rows={members} selectedId={selectedMember} onSelect={setSelectedMember} emptyLabel="Os contratos fechados serão agrupados por responsável." />
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
