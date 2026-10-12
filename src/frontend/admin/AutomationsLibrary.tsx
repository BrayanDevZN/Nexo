import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Download, FileArchive, RefreshCw, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { type createApi } from "./api";
import { Feedback, Loading, message } from "./shared";

type Automation = { id: string; name: string; description: string; filename: string; file_size: number; created_by_name: string; has_image: boolean; created_at: string };
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_AUTOMATION_FILE = 10 * 1024 * 1024;
const MAX_IMAGE = 2 * 1024 * 1024;

function AutomationImage({ api, item }: { api: ReturnType<typeof createApi>; item: Automation }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true; let objectUrl = "";
    if (!item.has_image) return () => { active = false; };
    void api.file(`/automations/${encodeURIComponent(item.id)}/image`).then(blob => {
      if (active) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }
    }).catch(() => {});
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [api, item.id, item.has_image]);
  return url ? <img src={url} alt={`Imagem de ${item.name}`} className="aspect-video w-full rounded-lg border object-cover" loading="lazy" /> : null;
}

export function AutomationsLibrary({ api }: { api: ReturnType<typeof createApi> }) {
  const [items, setItems] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setItems(await api.request<Automation[]>("/automations?limit=100&offset=0")); }
    catch (e) { setError(message(e)); }
    finally { setLoading(false); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const listener = (event: Event) => { if (["ready", "notifications.changed"].includes((event as CustomEvent).detail.type)) void load(); };
    window.addEventListener("nexo:realtime", listener); return () => window.removeEventListener("nexo:realtime", listener);
  }, [load]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = event.currentTarget; const data = new FormData(form);
    const selected = data.get("file");
    if (!(selected instanceof File) || !selected.size) { setError("Anexe o arquivo da automação."); return; }
    if (selected.size > MAX_AUTOMATION_FILE) { setError("O arquivo pode ter no máximo 20 MB."); return; }
    const photo = data.get("image");
    if (photo instanceof File && photo.size && (!IMAGE_TYPES.includes(photo.type) || photo.size > MAX_IMAGE)) {
      setError("A imagem deve ser JPEG, PNG ou WebP e ter até 2 MB."); return;
    }
    setBusy(true); setError(""); setSuccess("");
    try {
      await api.mutate("/automations", "POST", data);
      setSuccess("Automação salva. Os membros aprovados já receberam um aviso no painel.");
      form.reset(); await load();
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  async function download(item: Automation) {
    setError("");
    try {
      const blob = await api.file(`/automations/${encodeURIComponent(item.id)}/download`);
      const url = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = url; link.download = item.filename; link.click(); URL.revokeObjectURL(url);
    } catch (e) { setError(message(e)); }
  }
  return <section className="flex flex-col gap-6" aria-labelledby="automations-title">
    <div className="admin-section-head"><div><span className="admin-eyebrow">BIBLIOTECA COMPARTILHADA</span><h1 id="automations-title" className="flex items-center gap-2">Automações <Workflow /></h1><p>Salve arquivos de automação para a equipe consultar e baixar.</p></div><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw data-icon="inline-start" /> Atualizar</Button></div>
    <Feedback error={error} success={success} />
    <Card><CardHeader><CardTitle>Salvar automação</CardTitle><CardDescription>As automações ficam disponíveis para todos os membros aprovados e a equipe recebe um aviso quando uma nova é publicada.</CardDescription></CardHeader><CardContent><form onSubmit={save} className="flex flex-col gap-5"><FieldGroup>
      <Field><FieldLabel htmlFor="automation-name">Nome</FieldLabel><Input id="automation-name" name="name" maxLength={120} required placeholder="Ex.: Captura de leads" /></Field>
      <Field><FieldLabel htmlFor="automation-description">Descrição</FieldLabel><Textarea id="automation-description" name="description" maxLength={5000} required placeholder="Explique o que a automação faz e como usar." /></Field>
      <Field><FieldLabel htmlFor="automation-file">Arquivo da automação</FieldLabel><Input id="automation-file" name="file" type="file" accept=".json,.zip,.yaml,.yml,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.rtf" required /><FieldDescription>JSON, ZIP, YAML e documentos compatíveis; até 10 MB.</FieldDescription></Field>
      <Field><FieldLabel htmlFor="automation-image">Foto (opcional)</FieldLabel><Input id="automation-image" name="image" type="file" accept="image/jpeg,image/png,image/webp" /><FieldDescription>JPEG, PNG ou WebP; até 2 MB.</FieldDescription></Field>
      </FieldGroup><Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar automação"}</Button></form></CardContent></Card>
    {loading ? <Loading /> : !items.length ? <Card><CardContent className="flex flex-col items-center gap-2 py-10 text-center"><FileArchive className="size-8 text-muted-foreground" /><p className="font-medium">Nenhuma automação salva ainda</p><p className="text-sm text-muted-foreground">A primeira que for publicada aparecerá aqui.</p></CardContent></Card> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map(item => <Card key={item.id} className="overflow-hidden">{item.has_image && <CardContent className="p-3 pb-0"><AutomationImage api={api} item={item} /></CardContent>}<CardHeader><div className="flex items-start justify-between gap-3"><div className="min-w-0"><CardTitle className="break-words">{item.name}</CardTitle><CardDescription className="mt-1">Por {item.created_by_name} · {new Date(item.created_at.endsWith("Z") ? item.created_at : item.created_at + "Z").toLocaleDateString("pt-BR")}</CardDescription></div><Badge variant="secondary">{(item.file_size / 1024 / 1024).toFixed(2)} MB</Badge></div></CardHeader><CardContent className="flex flex-col gap-4"><p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{item.description}</p><p className="truncate text-xs text-muted-foreground">Arquivo: {item.filename}</p><Button variant="outline" onClick={() => void download(item)}><Download data-icon="inline-start" /> Baixar automação</Button></CardContent></Card>)}</div>}
  </section>;
}
