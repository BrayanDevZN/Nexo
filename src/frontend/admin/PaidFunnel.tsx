import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import { ArrowRight, Check, GripVertical, MessageCircle, MousePointerClick, Pencil, RefreshCw, Trash2, Trophy, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { PAID_LEAD_STAGES, type PaidLead, type PaidLeadStage, type createApi } from "./api";
import { whatsappUrl } from "./contact";
import { Busy, Feedback, Field, FieldLabel, Loading, TextField, message } from "./shared";
import { useBoardAutoScroll } from "./boardAutoScroll";

// The same colours as the sales funnel, one per stage of this funnel.
const stageTones: Record<PaidLeadStage, string> = {
  visited: "border-funnel-lead/70 bg-funnel-lead/15",
  whatsapp_click: "border-funnel-contacted/70 bg-funnel-contacted/15",
  in_conversation: "border-funnel-diagnosis/70 bg-funnel-diagnosis/15",
  qualified: "border-funnel-qualified/70 bg-funnel-qualified/15",
  meeting: "border-funnel-meeting/70 bg-funnel-meeting/15",
  proposal: "border-funnel-proposal/70 bg-funnel-proposal/15",
  won: "border-funnel-won/70 bg-funnel-won/15",
  lost: "border-funnel-lost/70 bg-funnel-lost/15",
};
const placements: Record<string, string> = { header: "botão do topo", hero: "botão principal", middle: "botão do meio", footer: "botão do rodapé" };

const formatValue = (value: number | string) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const formatDate = (value: string) => new Date(value + "Z").toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const titleOf = (lead: PaidLead) => lead.name || "Visitante do anúncio";

export function PaidFunnel({ api }: { api: ReturnType<typeof createApi> }) {
  const [rows, setRows] = useState<PaidLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [dragging, setDragging] = useState("");
  const [dropStage, setDropStage] = useState<PaidLeadStage | null>(null);
  const [deleting, setDeleting] = useState<PaidLead | null>(null);
  const [editing, setEditing] = useState<PaidLead | null>(null);
  const loadSequence = useRef(0);
  const board = useBoardAutoScroll();

  const load = useCallback(async (silent = false) => {
    const sequence = ++loadSequence.current;
    if (!silent) setLoading(true);
    setError("");
    try {
      const all: PaidLead[] = [];
      for (let offset = 0; ; offset += 100) {
        const page = await api.request<PaidLead[]>("/paid-leads?limit=100&offset=" + offset);
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

  async function move(row: PaidLead, stage: PaidLeadStage) {
    if (row.stage === stage || busy) return;
    const previous = rows;
    setBusy(row.id); setError("");
    setRows(current => current.map(item => item.id === row.id ? { ...item, stage } : item));
    try { await api.mutate("/paid-leads/" + row.id, "PATCH", { stage }); await load(true); }
    catch (e) { setRows(previous); setError(message(e)); }
    finally { setBusy(""); setDragging(""); setDropStage(null); board.stop(); }
  }

  async function remove() {
    if (!deleting || busy) return;
    const previous = rows;
    setBusy(deleting.id); setError(""); setRows(current => current.filter(item => item.id !== deleting.id));
    try { await api.mutate("/paid-leads/" + deleting.id, "DELETE"); setDeleting(null); }
    catch (e) { setRows(previous); setError(message(e)); }
    finally { setBusy(""); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || busy) return;
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) || "").trim();
    setBusy(editing.id); setError("");
    try {
      await api.mutate("/paid-leads/" + editing.id, "PATCH", {
        name: value("name") || null, phone: value("phone") || null, email: value("email") || null,
        notes: value("notes") || null, contract_value: value("contract_value") || null,
      });
      setEditing(null); await load(true);
    } catch (e) { setError(message(e)); }
    finally { setBusy(""); }
  }

  const metrics = useMemo(() => {
    const clicked = rows.filter(row => row.whatsapp_clicked_at !== null).length;
    const won = rows.filter(row => row.stage === "won");
    return {
      clicked, rate: rows.length ? Math.round((clicked / rows.length) * 100) : null, won: won.length,
      wonValue: won.reduce((total, row) => total + Number(row.contract_value || 0), 0),
      value: rows.reduce((total, row) => total + Number(row.contract_value || 0), 0),
    };
  }, [rows]);

  return <section className="flex flex-col gap-6" aria-labelledby="paid-funnel-title">
    <div className="admin-section-head"><div><span className="admin-eyebrow">OPERAÇÃO COMERCIAL</span><h1 id="paid-funnel-title">Funil de tráfego pago</h1><p>Quem chegou pelos anúncios do Google. O site registra a visita e o clique no WhatsApp; daí em diante você move cada um entre as etapas.</p></div><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw data-icon="inline-start" /> Atualizar</Button></div>
    <Feedback error={error} />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card><CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardDescription>Visitas do anúncio</CardDescription><CardTitle className="text-2xl">{rows.length}</CardTitle></div><Eye className="size-5 text-primary" /></CardHeader></Card>
      <Card><CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardDescription>Clicaram no WhatsApp</CardDescription><CardTitle className="text-2xl">{metrics.clicked}</CardTitle><p className="text-xs text-muted-foreground">{metrics.rate === null ? "Sem visitas ainda" : metrics.rate + "% das visitas"}</p></div><MousePointerClick className="size-5 text-primary" /></CardHeader></Card>
      <Card><CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardDescription>Valor no funil</CardDescription><CardTitle className="text-2xl">{formatValue(metrics.value)}</CardTitle></div><MessageCircle className="size-5 text-primary" /></CardHeader></Card>
      <Card><CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardDescription>Contratos ganhos</CardDescription><CardTitle className="text-2xl">{metrics.won}</CardTitle><p className="text-xs text-muted-foreground">{formatValue(metrics.wonValue)} fechados</p></div><Trophy className="size-5 text-primary" /></CardHeader></Card>
    </div>
    {loading ? <Loading /> : <div ref={board.ref} onDragOver={board.onDragOver} className="flex min-h-[32rem] gap-4 overflow-x-auto pb-3" aria-label="Quadro do funil de tráfego pago">{PAID_LEAD_STAGES.map((stage, index) => {
      const items = rows.filter(row => row.stage === stage.value);
      const isDropTarget = dropStage === stage.value && dragging !== "";
      return <Card key={stage.value} className={cn("flex h-[32rem] max-h-[70vh] min-h-[24rem] w-[18rem] shrink-0 flex-col transition-shadow sm:w-[20rem]", stageTones[stage.value], isDropTarget && "ring-2 ring-primary")} onDragOver={(event: DragEvent) => { event.preventDefault(); setDropStage(stage.value); }} onDragLeave={event => { if (event.currentTarget === event.target) setDropStage(null); }} onDrop={event => { event.preventDefault(); const row = rows.find(item => item.id === dragging); if (row) void move(row, stage.value); }}>
        <CardHeader className="border-b p-4"><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-base">{stage.label}</CardTitle><CardDescription>{stage.description}{stage.bySite ? " · registrado pelo site" : ""}</CardDescription></div><Badge variant={stage.value === "won" ? "default" : stage.value === "lost" ? "destructive" : "secondary"}>{items.length}</Badge></div></CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
          {items.map(row => {
            const contactUrl = row.phone ? whatsappUrl(row.phone, titleOf(row)) : "";
            return <Card key={row.id} draggable={busy !== row.id} onDragStart={() => { board.start(); setDragging(row.id); setDropStage(null); }} onDragEnd={() => { board.stop(); setDragging(""); setDropStage(null); }} className={cn("shrink-0 cursor-grab border bg-background shadow-sm transition-opacity active:cursor-grabbing", dragging === row.id && "opacity-50")}>
              <CardHeader className="gap-2 p-4 pb-2"><div className="flex items-start gap-2"><GripVertical className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" /><div className="min-w-0 flex-1"><CardTitle className="truncate text-sm">{titleOf(row)}</CardTitle><CardDescription className="truncate">{row.phone || "Sem telefone ainda"}</CardDescription></div></div></CardHeader>
              <CardContent className="flex flex-col gap-1 px-4 pb-3 pt-0"><p className="text-xs text-muted-foreground">Visitou em {formatDate(row.created_at)}</p>{row.whatsapp_clicked_at && <p className="text-xs text-muted-foreground">Clicou no WhatsApp ({placements[row.placement || ""] || "botão do site"}) em {formatDate(row.whatsapp_clicked_at)}</p>}{row.notes && <p className="line-clamp-2 text-xs text-muted-foreground">{row.notes}</p>}{row.contract_value != null && <p className="text-sm font-medium">{formatValue(row.contract_value)}</p>}</CardContent>
              <CardFooter className="flex-wrap justify-between gap-1 p-3 pt-0"><div className="flex items-center gap-1">{contactUrl && <Button asChild size="sm" variant="outline"><a href={contactUrl} target="_blank" rel="noreferrer" draggable={false} onClick={event => event.stopPropagation()} aria-label={"Entrar em contato com " + titleOf(row) + " pelo WhatsApp"}><MessageCircle data-icon="inline-start" /> WhatsApp</a></Button>}<Button size="icon-sm" variant="ghost" disabled={busy === row.id} onClick={() => setEditing(row)} aria-label={"Editar " + titleOf(row)}><Pencil /></Button><Button size="icon-sm" variant="ghost" disabled={busy === row.id} onClick={() => setDeleting(row)} aria-label={"Remover " + titleOf(row) + " do quadro"}><Trash2 /></Button></div><div className="flex items-center gap-1">{stage.value !== "lost" && stage.value !== "won" && <Button size="sm" variant="ghost" disabled={busy === row.id} onClick={() => void move(row, PAID_LEAD_STAGES[index + 1].value)} aria-label={"Avançar " + titleOf(row)}>Avançar <ArrowRight data-icon="inline-end" /></Button>}{stage.value === "won" && <Badge variant="default"><Check data-icon="inline-start" /> Fechado</Badge>}</div></CardFooter>
            </Card>;
          })}
          {!items.length && <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">Solte oportunidades aqui</div>}
        </CardContent>
      </Card>;
    })}</div>}
    <Dialog open={!!editing} onOpenChange={open => { if (!open && !busy) setEditing(null); }}><DialogContent>
      <DialogHeader><DialogTitle>Editar lead do anúncio</DialogTitle><DialogDescription>Preencha o que for descobrindo sobre quem chegou pelo anúncio.</DialogDescription></DialogHeader>
      {editing && <form key={editing.id} onSubmit={save} className="flex flex-col gap-4">
        <TextField label="Nome" name="name" maxLength={160} defaultValue={editing.name || ""} />
        <TextField label="Celular" name="phone" type="tel" maxLength={30} defaultValue={editing.phone || ""} />
        <TextField label="E-mail" name="email" type="email" defaultValue={editing.email || ""} />
        <TextField label="Valor do contrato" name="contract_value" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={editing.contract_value ?? ""} />
        <Field><FieldLabel htmlFor="paid-lead-notes">Observações</FieldLabel><Textarea id="paid-lead-notes" name="notes" maxLength={10000} defaultValue={editing.notes || ""} /></Field>
        <DialogFooter><Button type="button" variant="outline" disabled={!!busy} onClick={() => setEditing(null)}>Cancelar</Button><Button type="submit" disabled={!!busy}>{busy ? <Busy>Salvando…</Busy> : "Salvar"}</Button></DialogFooter>
      </form>}
    </DialogContent></Dialog>
    <Dialog open={!!deleting} onOpenChange={open => { if (!open && !busy) setDeleting(null); }}><DialogContent><DialogHeader><DialogTitle>Remover lead?</DialogTitle><DialogDescription>{titleOf(deleting ?? ({} as PaidLead))} será excluído do funil de tráfego pago. Essa ação não pode ser desfeita.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={!!busy} onClick={() => setDeleting(null)}>Cancelar</Button><Button variant="destructive" disabled={!!busy} onClick={() => void remove()}>{busy ? "Removendo…" : <><Trash2 data-icon="inline-start" /> Remover lead</>}</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
