import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Building2, Check, Clock3, GripVertical, RefreshCw, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PIPELINE_STAGES, type ClientRecord, type PipelineStage, type createApi } from "./api";
import { Feedback, Loading, message } from "./shared";

const stageDescriptions: Record<PipelineStage, string> = {
  lead: "Novos contatos", contacted: "Primeiro contato", diagnosis: "Entendendo o cenário",
  proposal: "Propostas enviadas", negotiation: "Em negociação", won: "Contratos ganhos",
  lost: "Oportunidades perdidas",
};

function formatValue(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function Funnel({ api }: { api: ReturnType<typeof createApi> }) {
  const [rows, setRows] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [dragging, setDragging] = useState("");
  const [dropStage, setDropStage] = useState<PipelineStage | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setRows(await api.request<ClientRecord[]>("/clients?limit=100&offset=0")); }
    catch (e) { setError(message(e)); } finally { setLoading(false); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  async function move(row: ClientRecord, stage: PipelineStage) {
    if (row.pipeline_stage === stage || busy) return;
    const previous = rows;
    setBusy(row.id); setError("");
    setRows(current => current.map(item => item.id === row.id ? { ...item, pipeline_stage: stage, contract_closed: stage === "won" } : item));
    try { await api.mutate("/clients/" + row.id, "PATCH", { pipeline_stage: stage, contract_closed: stage === "won" }); }
    catch (e) { setRows(previous); setError(message(e)); }
    finally { setBusy(""); setDragging(""); setDropStage(null); }
  }

  const metrics = useMemo(() => {
    const won = rows.filter(row => row.pipeline_stage === "won" || row.contract_closed);
    const value = rows.reduce((total, row) => total + (row.contract_value || 0), 0);
    const wonValue = won.reduce((total, row) => total + (row.contract_value || 0), 0);
    return { won: won.length, value, wonValue };
  }, [rows]);

  return <section className="flex flex-col gap-6" aria-labelledby="funnel-title">
    <div className="admin-section-head"><div><span className="admin-eyebrow">OPERAÇÃO COMERCIAL</span><h1 id="funnel-title">Funil de vendas</h1><p>Arraste cada oportunidade entre as etapas, como em um backlog comercial.</p></div><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw data-icon="inline-start" /> Atualizar</Button></div>
    <Feedback error={error} />
    <div className="grid gap-3 sm:grid-cols-3">
      <Card><CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardDescription>Oportunidades</CardDescription><CardTitle className="text-2xl">{rows.length}</CardTitle></div><Building2 className="size-5 text-primary" /></CardHeader></Card>
      <Card><CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardDescription>Valor no funil</CardDescription><CardTitle className="text-2xl">{formatValue(metrics.value)}</CardTitle></div><Clock3 className="size-5 text-primary" /></CardHeader></Card>
      <Card><CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardDescription>Contratos ganhos</CardDescription><CardTitle className="text-2xl">{metrics.won}</CardTitle><p className="text-xs text-muted-foreground">{formatValue(metrics.wonValue)} fechados</p></div><Trophy className="size-5 text-primary" /></CardHeader></Card>
    </div>
    {loading ? <Loading /> : <div className="flex min-h-[32rem] gap-4 overflow-x-auto pb-3" aria-label="Quadro do funil de vendas">{PIPELINE_STAGES.map(stage => {
      const items = rows.filter(row => (row.pipeline_stage || "lead") === stage.value);
      const isDropTarget = dropStage === stage.value && dragging !== "";
      const index = PIPELINE_STAGES.findIndex(item => item.value === stage.value);
      return <Card key={stage.value} className={cn("flex min-h-[30rem] w-[18rem] shrink-0 flex-col bg-muted/20 transition-shadow sm:w-[20rem]", isDropTarget && "ring-2 ring-primary")} onDragOver={event => { event.preventDefault(); setDropStage(stage.value); }} onDragLeave={event => { if (event.currentTarget === event.target) setDropStage(null); }} onDrop={event => { event.preventDefault(); const row = rows.find(item => item.id === dragging); if (row) void move(row, stage.value); }}>
        <CardHeader className="border-b p-4"><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-base">{stage.label}</CardTitle><CardDescription>{stageDescriptions[stage.value]}</CardDescription></div><Badge variant={stage.value === "won" ? "default" : stage.value === "lost" ? "destructive" : "secondary"}>{items.length}</Badge></div></CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3 p-3">
          {items.map(row => <Card key={row.id} draggable={busy !== row.id} onDragStart={() => { setDragging(row.id); setDropStage(null); }} onDragEnd={() => { setDragging(""); setDropStage(null); }} className={cn("cursor-grab border bg-background shadow-sm transition-opacity active:cursor-grabbing", dragging === row.id && "opacity-50")}>
            <CardHeader className="gap-2 p-4 pb-2"><div className="flex items-start gap-2"><GripVertical className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" /><div className="min-w-0 flex-1"><CardTitle className="truncate text-sm">{row.name}</CardTitle><CardDescription className="truncate">{row.niche}</CardDescription></div></div></CardHeader>
            <CardContent className="flex flex-col gap-2 px-4 pb-3 pt-0"><p className="text-xs text-muted-foreground">Criado por {row.created_by_name}</p>{typeof row.contract_value === "number" && <p className="text-sm font-medium">{formatValue(row.contract_value)}</p>}{row.next_follow_up && <p className="text-xs text-muted-foreground">Follow-up: {new Date(row.next_follow_up).toLocaleDateString("pt-BR")}</p>}</CardContent>
            <CardFooter className="justify-end p-3 pt-0">{stage.value !== "lost" && stage.value !== "won" && <Button size="sm" variant="ghost" disabled={busy === row.id} onClick={() => void move(row, PIPELINE_STAGES[index + 1].value)} aria-label={"Avançar " + row.name}>Avançar <ArrowRight data-icon="inline-end" /></Button>}{stage.value === "won" && <Badge variant="default"><Check data-icon="inline-start" /> Fechado</Badge>}</CardFooter>
          </Card>)}
          {!items.length && <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">Solte oportunidades aqui</div>}
        </CardContent>
      </Card>;
    })}</div>}
  </section>;
}
