import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Download, FileText, RefreshCw, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { type createApi, type User } from "./api";
import { Busy, Feedback, Field, FieldLabel, Loading, message } from "./shared";

type Document = { id: string; filename: string; size: number; created_by_id: string; created_by_name: string; created_at: string };
export function Documents({ api, actor }: { api: ReturnType<typeof createApi>; actor: User }) {
  const [rows, setRows] = useState<Document[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deleting, setDeleting] = useState<Document | null>(null);
  const serial = useRef(0);
  const load = useCallback(async () => {
    const current = ++serial.current; setLoading(true); setError("");
    try { const result = await api.request<Document[]>("/documents?limit=20&offset=" + offset); if (current === serial.current) setRows(result); }
    catch (e) { if (current === serial.current) setError(message(e)); }
    finally { if (current === serial.current) setLoading(false); }
  }, [api, offset]);
  useEffect(() => { void load(); return () => { serial.current++; }; }, [load]);
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget;
    setBusy(true); setError(""); setSuccess("");
    try { await api.mutate("/documents", "POST", new FormData(form)); form.reset(); setSuccess("Documento salvo."); if (offset) setOffset(0); else await load(); }
    catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  async function download(row: Document) {
    setBusy(true); setError("");
    try {
      const blob = await api.file("/documents/" + row.id + "/download");
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = row.filename; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  async function remove() {
    if (!deleting) return; setBusy(true); setError("");
    try { await api.mutate("/documents/" + deleting.id, "DELETE"); setDeleting(null); setSuccess("Documento removido."); if (rows.length === 1 && offset) setOffset(offset - 20); else await load(); }
    catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  return <section className="flex flex-col gap-6" aria-labelledby="documents-title">
    <div className="admin-section-head"><div><span className="admin-eyebrow">ARQUIVOS DA EQUIPE</span><h1 id="documents-title">Documentos</h1><p>Salve e compartilhe documentos com os membros aprovados.</p></div><Button variant="outline" disabled={loading || busy} onClick={() => void load()}><RefreshCw /> Atualizar documentos</Button></div>
    <Feedback error={deleting ? "" : error} success={success} />
    <Card><CardHeader><CardTitle>Salvar documento</CardTitle></CardHeader><CardContent><form onSubmit={upload} className="flex flex-col gap-4"><Field><FieldLabel htmlFor="document-file">Escolha um arquivo</FieldLabel><Input id="document-file" name="file" type="file" required accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.odt,.ods,.rtf" disabled={busy} className="h-auto cursor-pointer py-3 file:mr-4 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-primary" /><p className="text-sm text-muted-foreground">PDF, documentos de texto, planilhas e apresentações.</p></Field><Button className="self-start" type="submit" disabled={busy}>{busy ? <Busy /> : <><Upload /> Salvar documento</>}</Button></form></CardContent></Card>
    {loading ? <Loading /> : !rows.length && !error ? <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">Nenhum documento nesta página.</p> : <div className="admin-client-grid">{rows.map(row => <Card key={row.id}><CardHeader><div className="flex items-start gap-3"><FileText className="size-6 shrink-0 text-primary" /><CardTitle className="break-all">{row.filename}</CardTitle></div></CardHeader><CardContent className="flex flex-col gap-4"><div className="text-sm text-muted-foreground"><p>Enviado por {row.created_by_name}</p><p>{Math.ceil(row.size / 1024)} KB · {new Date(row.created_at).toLocaleDateString("pt-BR")}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => void download(row)} aria-label={"Baixar " + row.filename}><Download /> Baixar</Button>{(actor.role === "admin" || row.created_by_id === actor.id) && <Button variant="destructive" disabled={busy} onClick={() => setDeleting(row)} aria-label={"Excluir documento " + row.filename}><Trash2 /> Excluir</Button>}</div></CardContent></Card>)}</div>}
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Página {offset / 20 + 1}</p><div className="flex gap-2"><Button variant="outline" disabled={loading || busy || !offset} onClick={() => setOffset(offset - 20)}>Anterior</Button><Button variant="outline" disabled={loading || busy || rows.length < 20} onClick={() => setOffset(offset + 20)}>Próxima</Button></div></div>
    <Dialog open={!!deleting} onOpenChange={open => { if (!open && !busy) setDeleting(null); }}><DialogContent showCloseButton={!busy}><DialogHeader><DialogTitle>Excluir documento?</DialogTitle><DialogDescription>{deleting?.filename} será removido permanentemente.</DialogDescription></DialogHeader><Feedback error={error} /><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>Cancelar</Button><Button variant="destructive" disabled={busy} onClick={() => void remove()}>{busy ? <Busy /> : "Confirmar exclusão do documento"}</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
