import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Building2, Check, MessageCircle, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { PIPELINE_STAGES, type createApi, type ClientRecord, type ClientInput } from "./api";
import { type DirectoryMember } from "./Directory";
import { Busy, Feedback, Field, FieldGroup, FieldLabel, Loading, TextField, message } from "./shared";

function whatsappUrl(phone: string, name: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  const normalized = digits.startsWith("55") || digits.length > 11 ? digits : `55${digits}`;
  const text = encodeURIComponent(`Olá, ${name}! Aqui é da Nexo. Podemos conversar?`);
  return `https://wa.me/${normalized}?text=${text}`;
}

export function Clients({ api }: { api: ReturnType<typeof createApi> }) {
  const [rows, setRows] = useState<ClientRecord[]>([]);
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState({ niche: "", status: "", stage: "", name: "", created_by_id: "" });
  const [members, setMembers] = useState<DirectoryMember[]>([]);
  const [draftName, setDraftName] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      const all: DirectoryMember[] = [];
      for (let offset = 0; active; offset += 100) {
        const page = await api.request<DirectoryMember[]>("/members?limit=100&offset=" + offset);
        all.push(...page);
        if (page.length < 100) break;
      }
      if (active) setMembers(all);
    })().catch(e => { if (active) setError(message(e)); });
    return () => { active = false; };
  }, [api]);
  const [draftNiche, setDraftNiche] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editor, setEditor] = useState<ClientRecord | "new" | null>(null);
  const [deleting, setDeleting] = useState<ClientRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const serial = useRef(0);
  const load = useCallback(async () => {
    const id = ++serial.current;
    setLoading(true); setError("");
    const params = new URLSearchParams({ limit: "20", offset: String(offset) });
    if (filters.name) params.set("name", filters.name);
    if (filters.created_by_id) params.set("created_by_id", filters.created_by_id);
    if (filters.niche) params.set("niche", filters.niche);
    if (filters.status) params.set("contract_closed", filters.status);
    if (filters.stage) params.set("pipeline_stage", filters.stage);
    try {
      const result = await api.request<ClientRecord[]>("/clients?" + params);
      if (id === serial.current) setRows(result);
    } catch (e) { if (id === serial.current) setError(message(e)); }
    finally { if (id === serial.current) setLoading(false); }
  }, [api, filters, offset]);
  useEffect(() => { void load(); return () => { serial.current++; }; }, [load]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) || "").trim();
    const body: ClientInput = {
      name: value("name"), niche: value("niche"), phone: value("phone") || null,
      email: value("email") || null, notes: value("notes") || null, contract_closed: value("contract") === "true", contract_value: value("contract_value") ? Number(value("contract_value")) : null,
      pipeline_stage: value("pipeline_stage") as ClientInput["pipeline_stage"], next_follow_up: value("next_follow_up") || null,
    };
    setBusy(true); setError(""); setSuccess("");
    try {
      await api.mutate(editor === "new" ? "/clients" : "/clients/" + editor!.id,
        editor === "new" ? "POST" : "PATCH", body);
      setEditor(null); setSuccess("Cliente salvo."); await load();
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await api.mutate("/clients/" + deleting.id, "DELETE");
      setDeleting(null); setSuccess("Cliente removido.");
      if (rows.length === 1 && offset > 0) setOffset(offset - 20); else await load();
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  const row = editor && editor !== "new" ? editor : undefined;
  return <section className="flex flex-col gap-6" aria-labelledby="clients-title">
    <div className="admin-section-head">
      <div><span className="admin-eyebrow">RELACIONAMENTOS</span><h1 id="clients-title">Clientes</h1><p>Do primeiro contato ao contrato fechado.</p></div>
      <Button size="lg" onClick={() => { setError(""); setEditor("new"); }}><Plus data-icon="inline-start" /> Novo cliente</Button>
    </div>
    <Feedback error={editor || deleting ? "" : error} success={success} />
    <Card><CardHeader><CardTitle>Encontre um contato</CardTitle><CardDescription>Pesquise pelo nome e combine filtros por nicho, criador e contrato.</CardDescription></CardHeader>
      <CardContent><form onSubmit={e => { e.preventDefault(); setOffset(0); setFilters({ ...filters, niche: draftNiche.trim(), name: draftName.trim() }); }}>
        <FieldGroup className="admin-filters">
          <TextField label="Nome do cliente" placeholder="Pesquisar nome" value={draftName} onChange={e => setDraftName(e.target.value)} maxLength={160} />
          <Field><FieldLabel htmlFor="creator-filter">Criado por</FieldLabel><NativeSelect id="creator-filter" value={filters.created_by_id} onChange={e => { setOffset(0); setFilters({ ...filters, created_by_id: e.target.value }); }}><NativeSelectOption value="">Todos os membros</NativeSelectOption>{members.map(member => <NativeSelectOption key={member.id} value={member.id}>{member.name}</NativeSelectOption>)}</NativeSelect></Field>
          <TextField label="Nicho" placeholder="Ex.: Contabilidade" value={draftNiche} onChange={e => setDraftNiche(e.target.value)} maxLength={120} />
          <Field><FieldLabel htmlFor="stage-filter">Etapa</FieldLabel><NativeSelect id="stage-filter" value={filters.stage} onChange={e => { setOffset(0); setFilters({ ...filters, stage: e.target.value }); }}><NativeSelectOption value="">Todas</NativeSelectOption>{PIPELINE_STAGES.map(stage => <NativeSelectOption key={stage.value} value={stage.value}>{stage.label}</NativeSelectOption>)}</NativeSelect></Field>
          <Field><FieldLabel htmlFor="contract-filter">Contrato</FieldLabel><NativeSelect id="contract-filter" value={filters.status} onChange={e => { setOffset(0); setFilters({ ...filters, status: e.target.value }); }}>
            <NativeSelectOption value="">Todos</NativeSelectOption><NativeSelectOption value="true">Fechado</NativeSelectOption><NativeSelectOption value="false">Em negociação</NativeSelectOption>
          </NativeSelect></Field>
          <Button type="submit" variant="secondary" disabled={loading}>Filtrar</Button>
          <Button type="button" variant="ghost" disabled={loading} onClick={() => void load()} aria-label="Atualizar clientes"><RefreshCw data-icon="inline-start" /> Atualizar</Button>
        </FieldGroup>
      </form></CardContent>
    </Card>
    {loading ? <Loading /> : rows.length === 0 && !error ? <Empty>
      <EmptyHeader><EmptyMedia variant="icon"><Building2 /></EmptyMedia><EmptyTitle>Nenhum cliente nesta lista</EmptyTitle><EmptyDescription>Cadastre um cliente ou ajuste os filtros para encontrar seus contatos.</EmptyDescription></EmptyHeader>
    </Empty> : <div className="admin-client-grid">{rows.map(client => {
      const contactUrl = client.phone ? whatsappUrl(client.phone, client.name) : "";
      return <Card key={client.id}>
      <CardHeader><div className="flex items-start justify-between gap-3"><CardTitle>{client.name}</CardTitle><Badge variant={client.contract_closed || client.pipeline_stage === "won" ? "default" : client.pipeline_stage === "lost" ? "destructive" : "secondary"}>{client.contract_closed || client.pipeline_stage === "won" ? "Fechado" : PIPELINE_STAGES.find(stage => stage.value === client.pipeline_stage)?.label || "Em negociação"}</Badge></div><CardDescription>{client.niche}</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">Criado por {client.created_by_name}</p>
        {client.email && <p className="break-all text-sm">{client.email}</p>}
        {client.phone && <div className="flex flex-wrap items-center gap-2"><p className="text-sm">{client.phone}</p>{contactUrl && <Button asChild size="sm" variant="outline" className="border-emerald-500/40 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"><a href={contactUrl} target="_blank" rel="noreferrer" aria-label={"Entrar em contato com " + client.name + " pelo WhatsApp"}><MessageCircle data-icon="inline-start" /> WhatsApp</a></Button>}</div>}
        {typeof client.contract_value === "number" && <p className="text-sm font-medium">Valor: {client.contract_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>}
        {client.next_follow_up && <p className="text-sm text-muted-foreground">Próximo follow-up: {new Date(client.next_follow_up).toLocaleDateString("pt-BR")}</p>}
        {client.notes && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{client.notes}</p>}
        {!client.phone && !client.email && !client.notes && <p className="text-sm text-muted-foreground">Adicione os dados de contato e observações.</p>}
      </CardContent>
      <CardFooter className="justify-between gap-2"><Button variant="outline" onClick={() => { setError(""); setEditor(client); }} aria-label={"Editar " + client.name}><Pencil data-icon="inline-start" /> Editar</Button><Button variant="destructive" onClick={() => { setError(""); setDeleting(client); }} aria-label={"Excluir " + client.name}><Trash2 data-icon="inline-start" /> Excluir</Button></CardFooter>
    </Card>;
    })}</div>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">{rows.length} contatos nesta página · Página {offset / 20 + 1}</p>
      <div className="flex gap-2"><Button variant="outline" disabled={loading || offset === 0} onClick={() => setOffset(offset - 20)}><ArrowLeft data-icon="inline-start" /> Anterior</Button><Button variant="outline" disabled={loading || rows.length < 20} onClick={() => setOffset(offset + 20)}>Próxima<ArrowRight data-icon="inline-end" /></Button></div>
    </div>
    <Dialog open={editor !== null} onOpenChange={open => { if (!open && !busy) { setEditor(null); setError(""); } }}>
      <DialogContent showCloseButton={!busy}>
        <DialogHeader><DialogTitle>{editor === "new" ? "Novo cliente" : "Editar cliente"}</DialogTitle><DialogDescription>Registre o contato e acompanhe a contratação.</DialogDescription></DialogHeader>
        <Feedback error={error} />
        <form onSubmit={save} className="flex flex-col gap-5">
          <FieldGroup>
            <TextField label="Nome / empresa" name="name" required maxLength={160} defaultValue={row?.name} />
            <TextField label="Nicho" name="niche" required maxLength={120} defaultValue={row?.niche} />
            <TextField label="E-mail (opcional)" name="email" type="email" defaultValue={row?.email || ""} />
            <TextField label="Celular (opcional)" name="phone" type="tel" minLength={10} maxLength={30} defaultValue={row?.phone || ""} />
            <TextField label="Valor do contrato (opcional)" name="contract_value" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={row?.contract_value ?? ""} />
            <Field><FieldLabel htmlFor="pipeline-stage">Etapa do funil</FieldLabel><NativeSelect id="pipeline-stage" name="pipeline_stage" defaultValue={row?.pipeline_stage || "lead"}>{PIPELINE_STAGES.map(stage => <NativeSelectOption key={stage.value} value={stage.value}>{stage.label}</NativeSelectOption>)}</NativeSelect></Field>
            <TextField label="Próximo follow-up (opcional)" name="next_follow_up" type="date" defaultValue={row?.next_follow_up ? row.next_follow_up.slice(0, 10) : ""} />
            <Field><FieldLabel htmlFor="client-contract">Situação do contrato</FieldLabel><NativeSelect id="client-contract" name="contract" defaultValue={String(row?.contract_closed || false)}>
              <NativeSelectOption value="false">Em negociação</NativeSelectOption><NativeSelectOption value="true">Fechado</NativeSelectOption>
            </NativeSelect></Field>
            <Field><FieldLabel htmlFor="client-notes">Observações (opcional)</FieldLabel><Textarea id="client-notes" name="notes" maxLength={10000} defaultValue={row?.notes || ""} /></Field>
          </FieldGroup>
          <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => { setEditor(null); setError(""); }}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? <Busy>Salvando…</Busy> : <><Check data-icon="inline-start" /> Salvar cliente</>}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog open={!!deleting} onOpenChange={open => { if (!open && !busy) { setDeleting(null); setError(""); } }}>
      <DialogContent showCloseButton={!busy}><DialogHeader><DialogTitle>Excluir cliente?</DialogTitle><DialogDescription>O registro de {deleting?.name} será removido. Essa ação não pode ser desfeita.</DialogDescription></DialogHeader><Feedback error={error} />
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>Cancelar</Button><Button variant="destructive" disabled={busy} onClick={() => void remove()}>{busy ? <Busy /> : "Confirmar exclusão"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
