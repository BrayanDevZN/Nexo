import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Download, FileArchive, Image, Paperclip, Plus, RefreshCw, Workflow, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { type createApi } from "./api";
import { Feedback, Loading, message } from "./shared";

type Automation = { id: string; name: string; description: string; filename: string; file_size: number; created_by_name: string; has_image: boolean; created_at: string };
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_AUTOMATION_FILE = 10 * 1024 * 1024;
const MAX_IMAGE = 2 * 1024 * 1024;

function formatSize(size: number) {
  return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(2)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
}

function FilePicker({
  id,
  label,
  name,
  accept,
  description,
  value,
  onChange,
  optional = false,
  image = false,
}: {
  id: string;
  label: string;
  name: string;
  accept: string;
  description: string;
  value: File | null;
  onChange: (file: File | null) => void;
  optional?: boolean;
  image?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const FileIcon = image ? Image : FileArchive;
  return <Field>
    <FieldLabel htmlFor={id}>{label}{optional && <span className="ml-1 font-normal text-muted-foreground">(opcional)</span>}</FieldLabel>
    <Input
      ref={inputRef}
      id={id}
      name={name}
      type="file"
      accept={accept}
      className="sr-only"
      aria-label={label}
      aria-describedby={`${id}-description`}
      tabIndex={-1}
      onChange={event => onChange(event.currentTarget.files?.[0] ?? null)}
    />
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
      <Button type="button" variant="outline" className="shrink-0" onClick={() => inputRef.current?.click()}>
        <Paperclip data-icon="inline-start" />{value ? "Trocar arquivo" : "Anexar arquivo"}
      </Button>
      <div className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2" aria-live="polite">
        {value ? <>
          <FileIcon className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate text-sm" title={value.name}>{value.name}</span>
          <Badge variant="outline" className="shrink-0">{formatSize(value.size)}</Badge>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remover ${label.toLowerCase()}`} onClick={() => {
            if (inputRef.current) inputRef.current.value = "";
            onChange(null);
          }}><X /></Button>
        </> : <span className="text-sm text-muted-foreground">Nenhum arquivo anexado</span>}
      </div>
    </div>
    <FieldDescription id={`${id}-description`}>{description}</FieldDescription>
  </Field>;
}

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
  const [composerOpen, setComposerOpen] = useState(false);
  const [automationFile, setAutomationFile] = useState<File | null>(null);
  const [automationImage, setAutomationImage] = useState<File | null>(null);
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
    if (selected.size > MAX_AUTOMATION_FILE) { setError("O arquivo pode ter no máximo 10 MB."); return; }
    const photo = data.get("image");
    if (photo instanceof File && photo.size && (!IMAGE_TYPES.includes(photo.type) || photo.size > MAX_IMAGE)) {
      setError("A imagem deve ser JPEG, PNG ou WebP e ter até 2 MB."); return;
    }
    setBusy(true); setError(""); setSuccess("");
    try {
      await api.mutate("/automations", "POST", data);
      setSuccess("Automação salva. Os membros aprovados já receberam um aviso no painel.");
      form.reset(); setAutomationFile(null); setAutomationImage(null); setComposerOpen(false); await load();
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
    <div className="admin-section-head items-start">
      <div><span className="admin-eyebrow">BIBLIOTECA COMPARTILHADA</span><h1 id="automations-title" className="flex items-center gap-2">Automações <Workflow /></h1><p>Consulte e baixe as automações compartilhadas pela equipe.</p></div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="outline" size="icon" disabled={loading} onClick={() => void load()} aria-label="Atualizar automações" title="Atualizar automações"><RefreshCw /></Button>
        <Dialog open={composerOpen} onOpenChange={open => { setComposerOpen(open); if (open) { setError(""); setSuccess(""); } }}>
          <DialogTrigger asChild><Button><Plus data-icon="inline-start" />Criar automação</Button></DialogTrigger>
          <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Criar automação</DialogTitle>
              <DialogDescription>Adicione os detalhes e o arquivo para compartilhar com os membros aprovados.</DialogDescription>
            </DialogHeader>
            <form onSubmit={save} className="mt-4 flex flex-col gap-5">
              <Feedback error={error} />
              <FieldGroup className="gap-4">
                <Field><FieldLabel htmlFor="automation-name">Nome</FieldLabel><Input id="automation-name" name="name" maxLength={120} required placeholder="Ex.: Captura de leads" /></Field>
                <Field><FieldLabel htmlFor="automation-description">Descrição</FieldLabel><Textarea id="automation-description" name="description" maxLength={5000} required placeholder="Explique o que a automação faz e como usar." /></Field>
                <FilePicker id="automation-file" name="file" label="Arquivo da automação" accept=".json,.zip,.yaml,.yml,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.rtf" description="JSON, ZIP, YAML e documentos compatíveis; até 10 MB." value={automationFile} onChange={setAutomationFile} />
                <FilePicker id="automation-image" name="image" label="Foto de capa" accept="image/jpeg,image/png,image/webp" description="JPEG, PNG ou WebP; até 2 MB." value={automationImage} onChange={setAutomationImage} optional image />
              </FieldGroup>
              <DialogFooter>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setComposerOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar automação"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
    <Feedback success={success} />
    {loading ? <Loading /> : !items.length ? <Card><CardContent className="py-8"><Empty><EmptyHeader><EmptyMedia variant="icon"><FileArchive /></EmptyMedia><EmptyTitle>Nenhuma automação salva ainda</EmptyTitle><EmptyDescription>A primeira que for publicada aparecerá aqui.</EmptyDescription></EmptyHeader><Button onClick={() => setComposerOpen(true)}><Plus data-icon="inline-start" />Criar automação</Button></Empty></CardContent></Card> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map(item => <Card key={item.id} className="overflow-hidden">{item.has_image && <CardContent className="p-3 pb-0"><AutomationImage api={api} item={item} /></CardContent>}<CardHeader><div className="flex items-start justify-between gap-3"><div className="min-w-0"><CardTitle className="break-words">{item.name}</CardTitle><CardDescription className="mt-1">Por {item.created_by_name} · {new Date(item.created_at.endsWith("Z") ? item.created_at : item.created_at + "Z").toLocaleDateString("pt-BR")}</CardDescription></div><Badge variant="secondary">{formatSize(item.file_size)}</Badge></div></CardHeader><CardContent className="flex flex-col gap-4"><p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{item.description}</p><p className="truncate text-xs text-muted-foreground" title={item.filename}>Arquivo: {item.filename}</p><Button variant="outline" onClick={() => void download(item)}><Download data-icon="inline-start" /> Baixar automação</Button></CardContent></Card>)}</div>}
  </section>;
}
