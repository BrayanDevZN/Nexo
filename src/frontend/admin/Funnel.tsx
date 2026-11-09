import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { ArrowRight, Building2, Check, Clock3, GripVertical, RefreshCw, Trash2, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PIPELINE_STAGES, salesChannelLabel, type ClientRecord, type PipelineStage, type createApi } from "./api";
import { mapsUrl } from "./contact";
import { ContactButtons } from "./ContactButtons";
import { MapsButton } from "./MapsLink";
import { Feedback, Loading, message } from "./shared";

const stageDescriptions: Record<PipelineStage, string> = {
  lead: "Novos contatos", contacted: "Primeiro contato", diagnosis: "Entendendo o cenário",
  proposal: "Propostas enviadas", negotiation: "Em negociação", won: "Contratos ganhos",
  lost: "Oportunidades perdidas",
};

const stageTones: Record<PipelineStage, string> = {
  lead: "border-funnel-lead/70 bg-funnel-lead/15",
  contacted: "border-funnel-contacted/70 bg-funnel-contacted/15",
  diagnosis: "border-funnel-diagnosis/70 bg-funnel-diagnosis/15",
  proposal: "border-funnel-proposal/70 bg-funnel-proposal/15",
  negotiation: "border-funnel-negotiation/70 bg-funnel-negotiation/15",
  won: "border-funnel-won/70 bg-funnel-won/15",
  lost: "border-funnel-lost/70 bg-funnel-lost/15",
};

function formatValue(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function Funnel({ api }: { api: ReturnType<typeof createApi> }) {
  const [rows, setRows] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [dragging, setDragging] = useState("");
  const [dropStage, setDropStage] = useState<PipelineStage | null>(null);
  const [deleting, setDeleting] = useState<ClientRecord | null>(null);
  const loadSequence = useRef(0);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const dragPointerX = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const autoScrollFrame = useRef<number | null>(null);
  const autoScrollTick = useRef<() => void>(() => {});

  autoScrollTick.current = () => {
    const board = boardRef.current;
    const pointerX = dragPointerX.current;
    if (!board || !isDraggingRef.current || pointerX === null) {
      autoScrollFrame.current = null;
      return;
    }

    const bounds = board.getBoundingClientRect();
    const edgeSize = 72;
    let delta = 0;
    if (pointerX - bounds.left < edgeSize && board.scrollLeft > 0) {
      const proximity = (edgeSize - (pointerX - bounds.left)) / edgeSize;
      delta = -Math.ceil(4 + proximity * 16);
    } else if (bounds.right - pointerX < edgeSize && board.scrollLeft + board.clientWidth < board.scrollWidth - 1) {
      const proximity = (edgeSize - (bounds.right - pointerX)) / edgeSize;
      delta = Math.ceil(4 + proximity * 16);
    }

    if (delta) {
      board.scrollLeft += delta;
      autoScrollFrame.current = requestAnimationFrame(() => autoScrollTick.current());
    } else {
      autoScrollFrame.current = null;
    }
  };

  const stopBoardAutoScroll = useCallback(() => {
    isDraggingRef.current = false;
    dragPointerX.current = null;
    if (autoScrollFrame.current !== null) {
      cancelAnimationFrame(autoScrollFrame.current);
      autoScrollFrame.current = null;
    }
  }, []);

  useEffect(() => () => {
    if (autoScrollFrame.current !== null) cancelAnimationFrame(autoScrollFrame.current);
  }, []);

  function handleBoardDragOver(event: DragEvent<HTMLDivElement>) {
    if (!isDraggingRef.current) return;
    event.preventDefault();
    dragPointerX.current = event.clientX;
    if (autoScrollFrame.current === null) {
      autoScrollFrame.current = requestAnimationFrame(() => autoScrollTick.current());
    }
  }

  const load = useCallback(async (silent = false) => {
    const sequence = ++loadSequence.current;
    if (!silent) setLoading(true);
    setError("");
    try {
      const all: ClientRecord[] = [];
      for (let offset = 0; ; offset += 100) {
        const page = await api.request<ClientRecord[]>("/clients?limit=100&offset=" + offset);
        all.push(...page);
        if (page.length < 100) break;
      }
      if (sequence === loadSequence.current) setRows(all);
    }
    catch (e) { if (sequence === loadSequence.current) setError(message(e)); }
    finally { if (sequence === loadSequence.current) setLoading(false); }
  }, [api]);
  useEffect(() => { void load(); return () => { loadSequence.current++; }; }, [load]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onRealtime = (event: Event) => {
      const type = (event as CustomEvent<{ type: string }>).detail?.type;
      if (type !== "clients.changed" && type !== "ready") return;
      clearTimeout(timer);
      timer = setTimeout(() => void load(true), 100);
    };
    window.addEventListener("nexo:realtime", onRealtime);
    return () => { clearTimeout(timer); window.removeEventListener("nexo:realtime", onRealtime); };
  }, [load]);

  async function move(row: ClientRecord, stage: PipelineStage) {
    if (row.pipeline_stage === stage || busy) return;
    const previous = rows;
    setBusy(row.id); setError("");
    setRows(current => current.map(item => item.id === row.id ? { ...item, pipeline_stage: stage, contract_closed: stage === "won" } : item));
    try { await api.mutate("/clients/" + row.id, "PATCH", { pipeline_stage: stage, contract_closed: stage === "won" }); await load(true); }
    catch (e) { setRows(previous); setError(message(e)); }
    finally { setBusy(""); setDragging(""); setDropStage(null); stopBoardAutoScroll(); }
  }

  async function remove() {
    if (!deleting || busy) return;
    const previous = rows;
    setBusy(deleting.id); setError(""); setRows(current => current.filter(item => item.id !== deleting.id));
    try { await api.mutate("/clients/" + deleting.id, "DELETE"); setDeleting(null); }
    catch (e) { setRows(previous); setError(message(e)); }
    finally { setBusy(""); }
  }

  const metrics = useMemo(() => {
    const won = rows.filter(row => row.pipeline_stage === "won" || row.contract_closed);
    const value = rows.reduce((total, row) => total + Number(row.contract_value || 0), 0);
    const wonValue = won.reduce((total, row) => total + Number(row.contract_value || 0), 0);
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
    {loading ? <Loading /> : <div ref={boardRef} onDragOver={handleBoardDragOver} className="flex min-h-[32rem] gap-4 overflow-x-auto pb-3" aria-label="Quadro do funil de vendas">{PIPELINE_STAGES.map(stage => {
      const items = rows.filter(row => (row.pipeline_stage || "lead") === stage.value);
      const isDropTarget = dropStage === stage.value && dragging !== "";
      const index = PIPELINE_STAGES.findIndex(item => item.value === stage.value);
      return <Card key={stage.value} className={cn("flex h-[32rem] max-h-[70vh] min-h-[24rem] w-[18rem] shrink-0 flex-col transition-shadow sm:w-[20rem]", stageTones[stage.value], isDropTarget && "ring-2 ring-primary")} onDragOver={event => { event.preventDefault(); setDropStage(stage.value); }} onDragLeave={event => { if (event.currentTarget === event.target) setDropStage(null); }} onDrop={event => { event.preventDefault(); const row = rows.find(item => item.id === dragging); if (row) void move(row, stage.value); }}>
        <CardHeader className="border-b p-4"><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-base">{stage.label}</CardTitle><CardDescription>{stageDescriptions[stage.value]}</CardDescription></div><Badge variant={stage.value === "won" ? "default" : stage.value === "lost" ? "destructive" : "secondary"}>{items.length}</Badge></div></CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
          {items.map(row => {
            return <Card key={row.id} draggable={busy !== row.id} onDragStart={() => { isDraggingRef.current = true; setDragging(row.id); setDropStage(null); }} onDragEnd={() => { stopBoardAutoScroll(); setDragging(""); setDropStage(null); }} className={cn("shrink-0 cursor-grab border bg-background shadow-sm transition-opacity active:cursor-grabbing", dragging === row.id && "opacity-50")}>
            <CardHeader className="gap-2 p-4 pb-2"><div className="flex items-start gap-2"><GripVertical className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" /><div className="min-w-0 flex-1"><CardTitle className="truncate text-sm">{row.name}</CardTitle><CardDescription className="truncate">{row.niche}</CardDescription></div></div></CardHeader>
            <CardContent className="flex flex-col gap-2 px-4 pb-3 pt-0"><p className="text-xs text-muted-foreground">Criado por {row.created_by_name}</p>{row.sales_channel && <p className="text-xs text-muted-foreground">Canal: {salesChannelLabel(row.sales_channel)}</p>}{row.contract_value != null && <p className="text-sm font-medium">{formatValue(row.contract_value)}</p>}{row.next_follow_up && <p className="text-xs text-muted-foreground">Follow-up: {new Date(row.next_follow_up).toLocaleDateString("pt-BR")}</p>}</CardContent>
            <CardFooter className="flex-wrap justify-between gap-1 p-3 pt-0"><div className="flex flex-wrap items-center gap-1"><ContactButtons client={row} />{row.address && <MapsButton href={mapsUrl({ query: row.name + " " + row.address })} label={"Ver " + row.name + " no mapa"} />}<Button size="icon-sm" variant="ghost" disabled={busy === row.id} onClick={() => setDeleting(row)} aria-label={"Remover " + row.name + " do quadro"}><Trash2 /></Button></div><div className="flex items-center gap-1">{stage.value !== "lost" && stage.value !== "won" && <Button size="sm" variant="ghost" disabled={busy === row.id} onClick={() => void move(row, PIPELINE_STAGES[index + 1].value)} aria-label={"Avançar " + row.name}>Avançar <ArrowRight data-icon="inline-end" /></Button>}{stage.value === "won" && <Badge variant="default"><Check data-icon="inline-start" /> Fechado</Badge>}</div></CardFooter>
          </Card>})}
          {!items.length && <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">Solte oportunidades aqui</div>}
        </CardContent>
      </Card>;
    })}</div>}
    <Dialog open={!!deleting} onOpenChange={open => { if (!open && !busy) setDeleting(null); }}><DialogContent><DialogHeader><DialogTitle>Remover oportunidade?</DialogTitle><DialogDescription>O cliente {deleting?.name} será excluído do sistema, não apenas desta visualização. Essa ação não pode ser desfeita.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={!!busy} onClick={() => setDeleting(null)}>Cancelar</Button><Button variant="destructive" disabled={!!busy} onClick={() => void remove()}>{busy ? "Removendo…" : <><Trash2 data-icon="inline-start" /> Remover cliente</>}</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
