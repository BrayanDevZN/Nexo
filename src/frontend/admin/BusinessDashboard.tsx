import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, CalendarDays, ChevronLeft, RefreshCw, TrendingUp, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { type ClientRecord, type createApi } from "./api";
import { Feedback, Loading, message } from "./shared";

type ViewPeriod = { year: number; month?: number; day?: number };
type Point = { key: string; label: string; value: number; contracts: number; month?: number; day?: number };
type GroupMetric = { id: string; label: string; contracts: number; value: number };
type ContractMetric = { id: string; name: string; niche: string; member: string; value: number; closedAt: Date };

const currency = (value: number | string) =>
  Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const compactCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(value);
const monthLabel = (year: number, month: number) =>
  new Date(year, month, 1).toLocaleDateString("pt-BR", { month: "long" });
const isWon = (row: ClientRecord) => row.contract_closed || row.pipeline_stage === "won";
const closedAt = (row: ClientRecord) => new Date(row.contract_closed_at || row.updated_at);

function AreaChart({ points, canDrill, onDrill }: {
  points: Point[];
  canDrill: boolean;
  onDrill: (point: Point) => void;
}) {
  const width = 960, height = 320, left = 76, right = 24, top = 22, bottom = 264;
  const plotWidth = width - left - right, plotHeight = bottom - top;
  const [hoveredKey, setHoveredKey] = useState("");
  const maxValue = Math.max(1, ...points.map(point => point.value));
  const coordinates = points.map((point, index) => ({
    point,
    x: points.length === 1 ? left + plotWidth / 2 : left + index * plotWidth / (points.length - 1),
    y: bottom - point.value / maxValue * plotHeight,
  }));
  const line = coordinates.map((item, index) =>
    (index ? "L " : "M ") + item.x + " " + item.y).join(" ");
  const area = coordinates.length
    ? "M " + coordinates[0].x + " " + bottom + " " +
      coordinates.map(item => "L " + item.x + " " + item.y).join(" ") +
      " L " + coordinates[coordinates.length - 1].x + " " + bottom + " Z"
    : "";
  const lastWithSales = [...coordinates].reverse().find(item => item.point.contracts > 0);
  const selected = (coordinates.find(item => item.point.key === hoveredKey) || lastWithSales || coordinates[coordinates.length - 1])?.point;
  return <div className="min-w-0">
    {selected && <p className="mb-2 text-sm text-muted-foreground">Vendas em <span className="font-medium text-foreground">{selected.label}</span>: {currency(selected.value)} · {selected.contracts} contratos</p>}
    <div className="overflow-x-auto">
      <svg viewBox={"0 0 " + width + " " + height} role="group" aria-label="Vendas por período; selecione um ponto para detalhar" className="h-[19rem] min-w-[44rem] w-full">
        <defs><linearGradient id="sales-mountain-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity="0.36" /><stop offset="100%" stopColor="var(--primary)" stopOpacity="0.02" /></linearGradient></defs>
        {[0, 1, 2, 3, 4].map(index => {
          const value = maxValue * (4 - index) / 4;
          const y = top + plotHeight * index / 4;
          return <g key={index}>
            <line x1={left} x2={width - right} y1={y} y2={y} stroke="var(--border)" strokeDasharray={index === 4 ? undefined : "4 6"} />
            <text x={left - 12} y={y + 4} textAnchor="end" fill="var(--muted-foreground)" fontSize="11">{compactCurrency(value)}</text>
          </g>;
        })}
        {area && <path d={area} fill="url(#sales-mountain-fill)" />}
        {line && <path d={line} fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
        {coordinates.map(({ point, x, y }, index) => <g key={point.key}>
          <circle cx={x} cy={y} r={canDrill ? 10 : 7} fill="var(--primary)" fillOpacity={canDrill ? "0.2" : "0.1"} />
          <circle cx={x} cy={y} r={5} fill="var(--primary)" stroke="var(--background)" strokeWidth="2" role={canDrill ? "button" : undefined} tabIndex={canDrill ? 0 : undefined}
            aria-label={canDrill ? point.label + ": " + currency(point.value) + ", " + point.contracts + " contratos. Abrir detalhamento." : point.label + ": " + currency(point.value) + ", " + point.contracts + " contratos"}
            onClick={canDrill ? () => onDrill(point) : undefined}
            onKeyDown={canDrill ? event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onDrill(point); } } : undefined}
            onMouseEnter={() => setHoveredKey(point.key)}
            onMouseLeave={() => setHoveredKey("")}
            onFocus={() => setHoveredKey(point.key)}
            onBlur={() => setHoveredKey("")}
          />
          {(points.length < 15 || index % 3 === 0 || index === points.length - 1) &&
            <text x={x} y={bottom + 28} textAnchor="middle" fill="var(--muted-foreground)" fontSize="11">{point.label}</text>}
        </g>)}
        {!points.length && <text x={width / 2} y={height / 2} textAnchor="middle" fill="var(--muted-foreground)" fontSize="14">Sem vendas neste período</text>}
      </svg>
    </div>
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
  const max = Math.max(1, ...rows.map(row => row.value));
  return <Card>
    <CardHeader><div className="flex items-center gap-2">{icon}<CardTitle>{title}</CardTitle></div><CardDescription>{description}</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-2">
      {rows.length ? rows.map((row, index) => <button key={row.id} type="button" onClick={() => onSelect(selectedId === row.id ? "all" : row.id)}
        aria-pressed={selectedId === row.id} className="flex min-w-0 flex-col gap-2 rounded-lg p-3 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex min-w-0 items-center justify-between gap-3"><span className="min-w-0 truncate font-medium">{index + 1}. {row.label}</span><span className="shrink-0 text-sm tabular-nums">{currency(row.value)}</span></span>
        <span className="flex items-center gap-3"><span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: Math.max(row.value ? 3 : 0, row.value / max * 100) + "%" }} /></span><Badge variant="secondary">{row.contracts} contratos</Badge></span>
      </button>) : <Empty><EmptyHeader><EmptyMedia variant="icon">{icon}</EmptyMedia><EmptyTitle>Sem vendas no período</EmptyTitle><EmptyDescription>{emptyLabel}</EmptyDescription></EmptyHeader></Empty>}
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
    for (const row of filteredSales) {
      const item = grouped.get(row.created_by_id) || {
        id: row.created_by_id, label: row.created_by_name || "Membro removido", contracts: 0, value: 0,
      };
      item.contracts += 1;
      item.value += Number(row.contract_value || 0);
      grouped.set(row.created_by_id, item);
    }
    return [...grouped.values()].sort((a, b) => b.value - a.value || b.contracts - a.contracts);
  }, [filteredSales]);

  const niches = useMemo(() => {
    const grouped = new Map<string, GroupMetric>();
    for (const row of filteredSales) {
      const id = row.niche || "Sem nicho";
      const item = grouped.get(id) || { id, label: id, contracts: 0, value: 0 };
      item.contracts += 1;
      item.value += Number(row.contract_value || 0);
      grouped.set(id, item);
    }
    return [...grouped.values()].sort((a, b) => b.value - a.value || b.contracts - a.contracts).slice(0, 8);
  }, [filteredSales]);

  const topContracts = useMemo<ContractMetric[]>(() => [...filteredSales].map(row => ({
    id: row.id, name: row.name, niche: row.niche,
    member: row.created_by_name || "Membro removido",
    value: Number(row.contract_value || 0), closedAt: closedAt(row),
  })).sort((a, b) => b.value - a.value || b.closedAt.getTime() - a.closedAt.getTime()).slice(0, 10), [filteredSales]);

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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader><CardDescription>Faturamento no período</CardDescription><CardTitle className="text-2xl">{currency(totalValue)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Contratos fechados</CardDescription><CardTitle className="text-2xl">{filteredSales.length}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Ticket médio</CardDescription><CardTitle className="text-xl">{currency(averageValue)}</CardTitle></CardHeader></Card>
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

      <div className="grid gap-4 xl:grid-cols-3">
        <RankedBars title="Vendas por membro" description="Receita e quantidade de contratos fechados." icon={<Users className="text-primary" />} rows={members} selectedId={selectedMember} onSelect={setSelectedMember} emptyLabel="Os contratos fechados serão agrupados por responsável." />
        <RankedBars title="Vendas por nicho" description="Nichos que geraram mais receita no período." icon={<Building2 className="text-primary" />} rows={niches} selectedId={selectedNiche} onSelect={setSelectedNiche} emptyLabel="Os nichos com contratos fechados aparecerão aqui." />
        <Card>
          <CardHeader><CardTitle>Contratos que mais faturaram</CardTitle><CardDescription>Selecione um contrato para cruzar o resultado nos outros gráficos.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {topContracts.length ? topContracts.map((contract, index) => <button key={contract.id} type="button" onClick={() => setSelectedContract(selectedContract === contract.id ? "all" : contract.id)} aria-pressed={selectedContract === contract.id}
              className="flex min-w-0 flex-col gap-2 rounded-lg p-3 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="flex min-w-0 items-center justify-between gap-3"><span className="min-w-0 truncate font-medium">{index + 1}. {contract.name}</span><span className="shrink-0 text-sm tabular-nums">{currency(contract.value)}</span></span>
              <span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground"><span>{contract.niche}</span><span>·</span><span>{contract.member}</span><span>·</span><span>{contract.closedAt.toLocaleDateString("pt-BR")}</span></span>
            </button>) : <Empty><EmptyHeader><EmptyMedia variant="icon"><Building2 /></EmptyMedia><EmptyTitle>Nenhum contrato fechado</EmptyTitle><EmptyDescription>Os contratos de maior valor aparecerão aqui.</EmptyDescription></EmptyHeader></Empty>}
          </CardContent>
        </Card>
      </div>

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
