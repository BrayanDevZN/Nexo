import { useCallback, useEffect, useState } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PIPELINE_STAGES, type ClientRecord, type PipelineStage, type createApi } from "./api";
import { Feedback, Loading, message } from "./shared";

export function Funnel({ api }: { api: ReturnType<typeof createApi> }) {
  const [rows, setRows] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setRows(await api.request<ClientRecord[]>("/clients?limit=100&offset=0")); }
    catch (e) { setError(message(e)); } finally { setLoading(false); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);
  async function move(row: ClientRecord, stage: PipelineStage) {
    setBusy(row.id); setError("");
    try { await api.mutate("/clients/" + row.id, "PATCH", { pipeline_stage: stage, contract_closed: stage === "won" }); await load(); }
    catch (e) { setError(message(e)); } finally { setBusy(""); }
  }
  return <section className="flex flex-col gap-6" aria-labelledby="funnel-title">
    <div className="admin-section-head"><div><span className="admin-eyebrow">OPERAÇÃO COMERCIAL</span><h1 id="funnel-title">Funil de vendas</h1><p>Acompanhe cada oportunidade até o fechamento.</p></div><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw data-icon="inline-start" /> Atualizar</Button></div>
    <Feedback error={error} />
    {loading ? <Loading /> : <div className="grid gap-4 overflow-x-auto pb-2 xl:grid-cols-7">{PIPELINE_STAGES.map((stage, index) => { const items = rows.filter(row => (row.pipeline_stage || "lead") === stage.value); return <Card key={stage.value} className="min-w-[220px] bg-muted/20"><CardHeader className="p-4"><div className="flex items-center justify-between gap-2"><CardTitle className="text-base">{stage.label}</CardTitle><Badge variant="secondary">{items.length}</Badge></div><CardDescription>{stage.value === "won" ? "Contratos ganhos" : stage.value === "lost" ? "Oportunidades perdidas" : "Em andamento"}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3 p-4 pt-0">{items.map(row => <div key={row.id} className="rounded-lg border bg-background p-3 shadow-sm"><p className="font-medium">{row.name}</p><p className="text-xs text-muted-foreground">{row.niche}</p>{typeof row.contract_value === "number" && <p className="mt-2 text-sm font-medium">{row.contract_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>}{row.next_follow_up && <p className="mt-1 text-xs text-muted-foreground">Follow-up: {new Date(row.next_follow_up).toLocaleDateString("pt-BR")}</p>}<div className="mt-3 flex justify-end">{index < PIPELINE_STAGES.length - 1 && <Button size="sm" variant="ghost" disabled={busy === row.id} onClick={() => void move(row, PIPELINE_STAGES[index + 1].value)} aria-label={"Mover " + row.name + " para " + PIPELINE_STAGES[index + 1].label}>Avançar <ArrowRight data-icon="inline-end" /></Button>}</div></div>)}{!items.length && <p className="py-5 text-center text-xs text-muted-foreground">Nenhuma oportunidade</p>}</CardContent></Card>; })}</div>}
  </section>;
}
