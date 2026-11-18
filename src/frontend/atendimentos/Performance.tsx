import { useEffect, useMemo, useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp } from "lucide-react";
import { Feedback, message } from "@/admin/shared";
import { formatMoney, ROLE_LABELS, type BookingApi, type Business, type Performance as Report, type PerformanceRow } from "./api";
import { Picture } from "./Photo";
import { loadPrefs } from "./calendarPrefs";

type Range = "week" | "month" | "last-month" | "90d" | "all";
const RANGES: { id: Range; label: string }[] = [
  { id: "week", label: "Esta semana" }, { id: "month", label: "Este mês" }, { id: "last-month", label: "Mês passado" }, { id: "90d", label: "90 dias" }, { id: "all", label: "Tudo" },
];

/** The query for a range: the business's own calendar for week and month, plain instants for the rest. */
function queryFor(range: Range, weekStartsMonday: boolean) {
  const query = new URLSearchParams();
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  if (range === "week" || range === "month") { query.set("period", range); if (range === "week" && weekStartsMonday) query.set("week_starts", "monday"); }
  else if (range === "last-month") { const first = new Date(now.getFullYear(), now.getMonth() - 1, 1); query.set("period", "month"); query.set("date", `${first.getFullYear()}-${pad(first.getMonth() + 1)}-01`); }
  else if (range === "90d") { const from = new Date(now); from.setDate(from.getDate() - 90); query.set("starts_from", from.toISOString()); query.set("starts_until", now.toISOString()); }
  return query;
}
const percent = (part: number, whole: number) => whole === 0 ? "—" : Math.round(part / whole * 100) + "%";

/** What each person did: appointments they attended by outcome, the revenue of the finished ones and how many they booked. */
export function Performance({ api, business }: { api: BookingApi; business: Business }) {
  const [range, setRange] = useState<Range>("month");
  const [report, setReport] = useState<Report>();
  const [error, setError] = useState("");
  const base = "/businesses/" + business.id;
  useEffect(() => {
    let active = true;
    setReport(undefined); setError("");
    api.request<Report>(base + "/performance?" + queryFor(range, loadPrefs(business.id).firstDay === 1)).then(data => { if (active) setReport(data); }).catch(e => { if (active) setError(message(e)); });
    return () => { active = false; };
  }, [api, base, range]);
  const people = useMemo(() => report?.rows.filter(row => row.total > 0 || row.created > 0 || row.user_id) ?? [], [report]);
  const leader = report?.rows.find(row => row.user_id && row.done > 0);
  const finished = report ? report.rows.reduce((sum, row) => sum + row.done + row.no_show + row.cancelled, 0) : 0;
  const top = Math.max(1, ...(report?.rows.map(row => row.total) ?? [1]));
  return <section className="flex flex-col gap-6">
    <div className="bk-head">
      <div><h1>Desempenho</h1><p>{!report ? "Carregando os números da equipe…" : report.total === 0 ? "Nenhum atendimento neste período." : leader ? <><strong>{leader.name}</strong> lidera com {leader.done} {leader.done === 1 ? "concluído" : "concluídos"}</> : `${report.total} ${report.total === 1 ? "atendimento" : "atendimentos"} no período, nenhum concluído ainda`}</p></div>
      <ToggleGroup type="single" value={range} onValueChange={value => { if (value) setRange(value as Range); }} aria-label="Período">
        {RANGES.map(item => <ToggleGroupItem key={item.id} value={item.id}>{item.label}</ToggleGroupItem>)}
      </ToggleGroup>
    </div>
    <Feedback error={error} />
    {!report && !error ? <div className="flex flex-col gap-3" role="status" aria-label="Carregando"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div> : report && <>
      <div className="bk-kpis">
        <div className="bk-kpi" data-hue><span>Atendimentos</span><strong>{report.total}</strong><small>no período</small></div>
        <div className="bk-kpi"><span>Concluídos</span><strong>{report.done}</strong><small>{percent(report.done, report.total)} do total</small></div>
        <div className="bk-kpi"><span>Faltas e cancelados</span><strong>{report.rows.reduce((sum, row) => sum + row.no_show + row.cancelled, 0)}</strong><small>{percent(report.rows.reduce((sum, row) => sum + row.no_show + row.cancelled, 0), finished)} dos encerrados</small></div>
        <div className="bk-kpi"><span>Receita dos concluídos</span><strong>{formatMoney(report.revenue)}</strong><small>soma dos preços</small></div>
      </div>
      {people.length === 0 ? <Empty><EmptyHeader><EmptyMedia variant="icon"><TrendingUp /></EmptyMedia><EmptyTitle>Sem números ainda</EmptyTitle><EmptyDescription>Quando a equipe marcar e concluir atendimentos, o desempenho de cada pessoa aparece aqui.</EmptyDescription></EmptyHeader></Empty>
        : <div className="bk-perf">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Pessoa</TableHead><TableHead className="text-right">Atendimentos</TableHead><TableHead className="text-right">Concluídos</TableHead>
              <TableHead className="text-right">Faltas</TableHead><TableHead className="text-right">Cancelados</TableHead><TableHead className="text-right">Receita</TableHead>
              <TableHead className="text-right">Marcou</TableHead>
            </TableRow></TableHeader>
            <TableBody>{people.map(row => <PerformanceLine key={row.user_id ?? "none"} api={api} row={row} top={top} />)}</TableBody>
          </Table>
        </div>}
      <p className="bk-muted">Os atendimentos contam para quem atende. “Marcou” conta quem criou o agendamento, atendendo ou não. Atendimentos sem funcionário aparecem em “Sem responsável”.</p>
    </>}
  </section>;
}

function PerformanceLine({ api, row, top }: { api: BookingApi; row: PerformanceRow; top: number }) {
  const idle = row.total === 0 && row.created === 0;
  return <TableRow data-idle={idle || undefined}>
    <TableCell><div className="bk-person">
      {row.user_id ? <Picture shared api={api} path={"/auth/profile/photo?user_id=" + encodeURIComponent(row.user_id)} name={row.name} hasPhoto={row.has_photo} className="size-8" /> : <span className="bk-person-none" aria-hidden="true">?</span>}
      <div><strong>{row.name}</strong><span>{row.role ? ROLE_LABELS[row.role] : "Nenhum funcionário escolhido"}</span></div>
    </div></TableCell>
    <TableCell className="text-right"><div className="bk-bar" role="img" aria-label={`${row.total} atendimentos, ${row.done} concluídos`}><i><u style={{ width: (row.total / top * 100) + "%" }}><b style={{ width: row.total ? (row.done / row.total * 100) + "%" : "0%" }} /></u></i><span>{row.total}</span></div></TableCell>
    <TableCell className="text-right bk-num">{row.done}<small>{percent(row.done, row.total)}</small></TableCell>
    <TableCell className="text-right bk-num">{row.no_show}</TableCell>
    <TableCell className="text-right bk-num">{row.cancelled}</TableCell>
    <TableCell className="text-right bk-num">{formatMoney(row.revenue)}</TableCell>
    <TableCell className="text-right bk-num">{row.user_id ? row.created : "—"}</TableCell>
  </TableRow>;
}
