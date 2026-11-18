import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Download, Eye, FileArchive, Paperclip, Pencil, Plus, RefreshCw, Trash2, Workflow, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { hasDeveloperAccess, type createApi, type User } from "./api";
import { Feedback, Loading, message } from "./shared";
import { MediaCover, MediaPicker, MediaViewer, type MediaItem } from "./AutomationMedia";

type Automation = { id: string; name: string; description: string; filename: string; file_size: number; created_by_id: string; created_by_name: string; has_image: boolean; media: MediaItem[]; can_manage: boolean; created_at: string };
const MAX_AUTOMATION_FILE = 10 * 1024 * 1024;

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
}: {
  id: string;
  label: string;
  name: string;
  accept: string;
  description: string;
  value: File | null;
  onChange: (file: File | null) => void;
  optional?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const FileIcon = FileArchive;
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

export function AutomationsLibrary({ api, user }: { api: ReturnType<typeof createApi>; user: User }) {
  const canCreate = hasDeveloperAccess(user.role);
  const [items, setItems] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [deleting, setDeleting] = useState<Automation | null>(null);
  const [automationFile, setAutomationFile] = useState<File | null>(null);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [removedMedia, setRemovedMedia] = useState<string[]>([]);
  const [viewing, setViewing] = useState<Automation | null>(null);
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
    if (!editing && (!(selected instanceof File) || !selected.size)) { setError("Anexe o arquivo da automação."); return; }
    if (selected instanceof File && selected.size > MAX_AUTOMATION_FILE) { setError("O arquivo pode ter no máximo 10 MB."); return; }
    data.delete("image"); data.delete("media");
    for (const file of mediaFiles) data.append("media", file);
    setBusy(true); setError(""); setSuccess("");
    try {
      if (editing) {
        for (const id of removedMedia) data.append("remove_media", id);
        await api.mutate(`/automations/${encodeURIComponent(editing.id)}`, "PATCH", data);
        setSuccess("Automação atualizada. Os membros aprovados receberam um aviso.");
      } else {
        await api.mutate("/automations", "POST", data);
        setSuccess("Automação salva. Os membros aprovados já receberam um aviso no painel.");
      }
      form.reset(); setAutomationFile(null); setMediaFiles([]); setRemovedMedia([]); setEditing(null); setComposerOpen(false); await load();
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
  function openEditor(item: Automation | null) {
    setEditing(item); setAutomationFile(null); setMediaFiles([]); setRemovedMedia([]);
    setError(""); setSuccess(""); setComposerOpen(true);
  }
  async function removeAutomation() {
    if (!deleting || busy) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await api.mutate(`/automations/${encodeURIComponent(deleting.id)}`, "DELETE");
      setSuccess("Automação excluída. Os membros aprovados receberam um aviso.");
      setDeleting(null); await load();
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  return <section className="flex flex-col gap-6" aria-labelledby="automations-title">
    <div className="admin-section-head items-start">
      <div><span className="admin-eyebrow">BIBLIOTECA COMPARTILHADA</span><h1 id="automations-title" className="flex items-center gap-2">Automações <Workflow /></h1><p>Consulte e baixe as automações compartilhadas pela equipe.</p></div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="outline" size="icon" disabled={loading} onClick={() => void load()} aria-label="Atualizar automações" title="Atualizar automações"><RefreshCw /></Button>
        {canCreate && <Button onClick={() => openEditor(null)}><Plus data-icon="inline-start" />Criar automação</Button>}
        <Dialog open={composerOpen} onOpenChange={open => { setComposerOpen(open); if (!open) { setEditing(null); setAutomationFile(null); setMediaFiles([]); setRemovedMedia([]); } if (open) { setError(""); setSuccess(""); } }}>
          <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar automação" : "Criar automação"}</DialogTitle>
              <DialogDescription>{editing ? "Atualize os detalhes compartilhados com os membros aprovados." : "Adicione os detalhes e o arquivo para compartilhar com os membros aprovados."}</DialogDescription>
            </DialogHeader>
            <form key={editing?.id ?? "new"} onSubmit={save} className="mt-4 flex flex-col gap-5">
              <Feedback error={error} />
              <FieldGroup className="gap-4">
                <Field><FieldLabel htmlFor="automation-name">Nome</FieldLabel><Input id="automation-name" name="name" maxLength={120} required defaultValue={editing?.name ?? ""} placeholder="Ex.: Captura de leads" /></Field>
                <Field><FieldLabel htmlFor="automation-description">Descrição</FieldLabel><Textarea id="automation-description" name="description" maxLength={5000} required defaultValue={editing?.description ?? ""} placeholder="Explique o que a automação faz e como usar." /></Field>
                <FilePicker id="automation-file" name="file" label={editing ? "Substituir arquivo da automação" : "Arquivo da automação"} accept=".json,.zip,.yaml,.yml,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.rtf" description={editing ? `Arquivo atual: ${editing.filename}. Anexe outro somente se quiser substituí-lo; até 10 MB.` : "JSON, ZIP, YAML e documentos compatíveis; até 10 MB."} value={automationFile} onChange={setAutomationFile} />
                <MediaPicker files={mediaFiles} onFiles={setMediaFiles} existing={editing?.media ?? []} removed={removedMedia} onRemoveExisting={(id, remove) => setRemovedMedia(list => remove ? [...list, id] : list.filter(x => x !== id))} />
              </FieldGroup>
              <DialogFooter>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setComposerOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={busy}>{busy ? "Salvando…" : editing ? "Salvar alterações" : "Salvar automação"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
    <Feedback success={success} />
    {loading ? <Loading /> : !items.length ? <Card><CardContent className="py-8"><Empty><EmptyHeader><EmptyMedia variant="icon"><FileArchive /></EmptyMedia><EmptyTitle>Nenhuma automação salva ainda</EmptyTitle><EmptyDescription>A primeira que for publicada aparecerá aqui.</EmptyDescription></EmptyHeader>{canCreate && <Button onClick={() => openEditor(null)}><Plus data-icon="inline-start" />Criar automação</Button>}</Empty></CardContent></Card> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map(item => <Card key={item.id} className="overflow-hidden">{item.media.length > 0 && <CardContent className="p-3 pb-0"><button type="button" className="block w-full rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Abrir ${item.name}`} onClick={() => setViewing(item)}><MediaCover api={api} automationId={item.id} media={item.media} /></button></CardContent>}<CardHeader><div className="flex items-start justify-between gap-3"><div className="min-w-0"><CardTitle className="break-words">{item.name}</CardTitle><CardDescription className="mt-1">Por {item.created_by_name} · {new Date(item.created_at.endsWith("Z") ? item.created_at : item.created_at + "Z").toLocaleDateString("pt-BR")}</CardDescription></div><Badge variant="secondary">{formatSize(item.file_size)}</Badge></div></CardHeader><CardContent className="flex flex-col gap-4"><p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{item.description}</p><p className="truncate text-xs text-muted-foreground" title={item.filename}>Arquivo: {item.filename}</p><div className="flex flex-wrap gap-2"><Button onClick={() => setViewing(item)}><Eye data-icon="inline-start" />Abrir</Button><Button variant="outline" onClick={() => void download(item)}><Download data-icon="inline-start" /> Baixar automação</Button>{canCreate && item.can_manage && <><Button variant="outline" onClick={() => openEditor(item)}><Pencil data-icon="inline-start" />Editar</Button><Button variant="destructive" onClick={() => setDeleting(item)}><Trash2 data-icon="inline-start" />Excluir</Button></>}</div></CardContent></Card>)}</div>}
    <Dialog open={Boolean(viewing)} onOpenChange={open => { if (!open) setViewing(null); }}>
      <DialogContent className="automation-viewer gap-4 overflow-hidden p-4 sm:p-6">
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle className="break-words">{viewing?.name}</DialogTitle>
          <DialogDescription>Por {viewing?.created_by_name} · {viewing ? formatSize(viewing.file_size) : ""}</DialogDescription>
        </DialogHeader>
        {viewing && <div className="grid min-h-0 flex-1 gap-6 max-lg:grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_22rem]">
          <ScrollArea className="min-h-0 h-full">
            {viewing.media.length > 0 ? <MediaViewer api={api} automationId={viewing.id} media={viewing.media} /> : <Empty><EmptyHeader><EmptyMedia variant="icon"><FileArchive /></EmptyMedia><EmptyTitle>Sem imagens ou vídeos</EmptyTitle><EmptyDescription>Esta automação não tem mídia anexada.</EmptyDescription></EmptyHeader></Empty>}
          </ScrollArea>
          <ScrollArea className="min-h-0 h-full max-lg:max-h-[30dvh]">
            <div className="flex flex-col gap-3 pr-3">
              <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{viewing.description}</p>
              <p className="truncate text-xs text-muted-foreground" title={viewing.filename}>Arquivo: {viewing.filename}</p>
              <Button variant="outline" onClick={() => void download(viewing)}><Download data-icon="inline-start" />Baixar automação</Button>
            </div>
          </ScrollArea>
        </div>}
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(deleting)} onOpenChange={open => { if (!open && !busy) setDeleting(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Excluir automação?</DialogTitle><DialogDescription>A automação “{deleting?.name}” será removida da biblioteca. Os membros aprovados receberão um aviso.</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>Cancelar</Button><Button variant="destructive" disabled={busy} onClick={() => void removeAutomation()}>{busy ? "Excluindo…" : "Excluir automação"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}

