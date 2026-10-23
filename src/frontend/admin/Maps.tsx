import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Download, KeyRound, ListPlus, MapPin, Check, RefreshCw, Search, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CLIENT_NICHES, type createApi } from "./api";
import { mapsUrl } from "./contact";
import { MapsButton } from "./MapsLink";
import { Busy, Feedback, Field, FieldGroup, FieldLabel, Loading, TextField, message } from "./shared";

type MapsStatus = { configured: boolean; source: "panel" | "environment" | null; key_prefix: string | null; updated_at: string | null; own?: boolean };
type Job = { id: string; name: string; status: string; created_at: string | null };
type Lead = {
  title: string | null; category: string | null; address: string | null; phone: string | null;
  website: string | null; emails: string | null; review_rating: number | null; review_count: number | null;
  link: string | null; latitude: number | null; longitude: number | null;
};
type Results = { rows: Lead[]; total: number; truncated: boolean; in_funnel: number };

const CITIES: { name: string; lat: string; lon: string }[] = [
  { name: "São Paulo (SP)", lat: "-23.5505", lon: "-46.6333" },
  { name: "Rio de Janeiro (RJ)", lat: "-22.9068", lon: "-43.1729" },
  { name: "Belo Horizonte (MG)", lat: "-19.9167", lon: "-43.9345" },
  { name: "Brasília (DF)", lat: "-15.7939", lon: "-47.8828" },
  { name: "Curitiba (PR)", lat: "-25.4284", lon: "-49.2733" },
  { name: "Porto Alegre (RS)", lat: "-30.0346", lon: "-51.2177" },
  { name: "Florianópolis (SC)", lat: "-27.5954", lon: "-48.5480" },
  { name: "Salvador (BA)", lat: "-12.9714", lon: "-38.5014" },
  { name: "Recife (PE)", lat: "-8.0476", lon: "-34.8770" },
  { name: "Fortaleza (CE)", lat: "-3.7319", lon: "-38.5267" },
  { name: "Goiânia (GO)", lat: "-16.6869", lon: "-49.2648" },
  { name: "Vitória (ES)", lat: "-20.3155", lon: "-40.3128" },
  { name: "Campo Grande (MS)", lat: "-20.4697", lon: "-54.6201" },
  { name: "Manaus (AM)", lat: "-3.1190", lon: "-60.0217" },
  { name: "Belém (PA)", lat: "-1.4558", lon: "-48.4902" },
];
// Termos de busca no Google Maps para cada nicho que a Nexo atende ("Outro" não tem busca própria).
const NICHE_SEARCH: Record<string, string[]> = {
  "Contabilidade": ["escritório de contabilidade", "contador"],
  "Saúde": ["clínica médica", "clínica odontológica", "consultório"],
  "Beleza e estética": ["salão de beleza", "clínica de estética", "barbearia"],
  "Imobiliário": ["imobiliária", "corretor de imóveis"],
  "Advocacia": ["escritório de advocacia", "advogado"],
  "Educação": ["escola", "curso", "escola de idiomas"],
  "Varejo": ["loja de roupas", "loja de calçados", "loja de presentes"],
  "Comércio": ["loja", "papelaria", "mercado"],
  "Alimentação": ["restaurante", "padaria", "lanchonete"],
  "Tecnologia": ["empresa de tecnologia", "empresa de software", "assistência técnica"],
  "Construção civil": ["construtora", "empreiteira", "material de construção"],
  "Indústria": ["indústria", "fábrica"],
  "Logística": ["transportadora", "empresa de logística"],
  "Serviços profissionais": ["consultoria", "empresa de serviços"],
  "Marketing e publicidade": ["agência de marketing", "agência de publicidade"],
  "Automotivo": ["oficina mecânica", "concessionária", "autopeças"],
};
const NICHES = CLIENT_NICHES.filter(niche => NICHE_SEARCH[niche]);
const LIMITS = [10, 20, 50, 100, 200];
const JOB_META_KEY = "nexo-maps-job-meta";
type JobMeta = { niche?: string; limit?: number };
const readJobMeta = (): Record<string, JobMeta> => {
  try { return JSON.parse(localStorage.getItem(JOB_META_KEY) || "{}") as Record<string, JobMeta>; } catch { return {}; }
};
const saveJobMeta = (id: string, meta: JobMeta) => {
  try { localStorage.setItem(JOB_META_KEY, JSON.stringify({ ...readJobMeta(), [id]: meta })); } catch { /* sem armazenamento: usa os padrões */ }
};
const leadKey = (lead: Lead) => `${lead.link ?? ""}|${lead.title ?? ""}|${lead.address ?? ""}`;
const DEPTHS = [
  { value: 1, label: "Rápida: poucos resultados" },
  { value: 3, label: "Normal" },
  { value: 5, label: "Ampla: mais resultados" },
  { value: 10, label: "Máxima: demora mais" },
];
const DURATIONS = [{ value: 120, label: "2 minutos" }, { value: 300, label: "5 minutos" }, { value: 600, label: "10 minutos" }, { value: 1200, label: "20 minutos" }, { value: 1800, label: "30 minutos" }];
const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  ok: { label: "Concluída", variant: "default" },
  working: { label: "Em andamento", variant: "secondary" },
  pending: { label: "Na fila", variant: "secondary" },
  failed: { label: "Falhou", variant: "destructive" },
};
const ACTIVE = new Set(["working", "pending"]);
const POLL_MS = 5000;

const statusOf = (status: string) => STATUS[status] ?? { label: status || "Desconhecido", variant: "outline" as const };
const dateLabel = (value: string | null) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
};

function csvFile(rows: Lead[]) {
  const columns: [keyof Lead, string][] = [["title", "Nome"], ["category", "Categoria"], ["phone", "Telefone"], ["website", "Site"],
    ["emails", "E-mails"], ["review_rating", "Nota"], ["review_count", "Avaliações"], ["address", "Endereço"], ["link", "Link no Maps"]];
  const cell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [columns.map(([, label]) => cell(label)).join(","), ...rows.map(row => columns.map(([key]) => cell(row[key])).join(","))];
  return new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
}

export function Maps({ api, canManageKey, initialJobId = "" }: { api: ReturnType<typeof createApi>; canManageKey: boolean; initialJobId?: string }) {
  const [status, setStatus] = useState<MapsStatus>();
  const [keyInput, setKeyInput] = useState("");
  const [keyBusy, setKeyBusy] = useState(false);
  const [jobs, setJobs] = useState<Job[]>();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedId, setSelectedId] = useState(initialJobId);
  const [results, setResults] = useState<Results>();
  const [resultsLoading, setResultsLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [onlyPhone, setOnlyPhone] = useState(false);
  const [deleting, setDeleting] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const [leadNiche, setLeadNiche] = useState<string>(NICHES[0]);
  const [resultLimit, setResultLimit] = useState(0);
  const [form, setForm] = useState({
    name: "", niche: NICHES[0] as string, limit: 20, city: CITIES[0].name, lat: CITIES[0].lat, lon: CITIES[0].lon, radius: "5000",
    depth: 3, lang: "pt", duration: 300, email: false, fast: false,
  });

  const load = useCallback(async () => {
    try {
      api.invalidate();
      const current = await api.request<MapsStatus>("/maps/status");
      setStatus(current);
      setJobs(current.configured ? await api.request<Job[]>("/maps/jobs") : []);
      setError("");
    } catch (e) { setError(message(e)); setJobs(current => current ?? []); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  const hasActive = jobs?.some(job => ACTIVE.has(job.status)) ?? false;
  useEffect(() => {
    if (!hasActive) return;
    const timer = window.setInterval(() => { void load(); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [hasActive, load]);

  const selected = jobs?.find(job => job.id === selectedId);
  const selectedStatus = selected?.status;
  useEffect(() => {
    setResults(undefined); setFilter(""); setOnlyPhone(false); setAdded(new Set());
    const meta = readJobMeta()[selectedId];
    setResultLimit(meta?.limit ?? 0);
    if (meta?.niche && NICHES.some(niche => niche === meta.niche)) setLeadNiche(meta.niche);
    if (!selectedId || selectedStatus !== "ok") return;
    let active = true;
    setResultsLoading(true);
    api.request<Results>(`/maps/jobs/${selectedId}/results`)
      .then(data => { if (active) setResults(data); })
      .catch(e => { if (active) setError(message(e)); })
      .finally(() => { if (active) setResultsLoading(false); });
    return () => { active = false; };
  }, [api, selectedId, selectedStatus]);

  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase();
    const matching = (results?.rows ?? []).filter(row =>
      (!onlyPhone || row.phone) &&
      (!term || [row.title, row.category, row.address, row.phone, row.website, row.emails].some(value => value?.toLowerCase().includes(term))));
    return resultLimit > 0 ? matching.slice(0, resultLimit) : matching;
  }, [results, filter, onlyPhone, resultLimit]);
  const pending = visible.filter(row => row.title && !added.has(leadKey(row)));

  function pickCity(name: string) {
    const city = CITIES.find(item => item.name === name);
    setForm(current => city ? { ...current, city: name, lat: city.lat, lon: city.lon } : { ...current, city: "" });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const keywords = NICHE_SEARCH[form.niche] ?? [];
    const lat = Number(form.lat), lon = Number(form.lon), radius = Number(form.radius);
    setError(""); setSuccess("");
    if (!keywords.length) { setError("Escolha um nicho para buscar."); return; }
    if (!form.lat.trim() || !form.lon.trim() || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      setError("Confira a latitude (-90 a 90) e a longitude (-180 a 180)."); return;
    }
    if (!Number.isInteger(radius) || radius < 100 || radius > 50000) { setError("O raio deve ficar entre 100 e 50000 metros."); return; }
    setBusy(true);
    try {
      const created = await api.mutate<{ id: string }>("/maps/jobs", "POST", {
        name: form.name.trim() || `${form.niche} · ${form.city || "local personalizado"}`.slice(0, 80),
        keywords, niche: form.niche, lat, lon, radius, depth: form.depth, lang: form.lang, max_time: form.duration,
        email: form.email, fast_mode: form.fast,
      });
      saveJobMeta(created.id, { niche: form.niche, limit: form.limit });
      setLeadNiche(form.niche);
      setSuccess("Busca iniciada. Os resultados aparecem aqui quando ela terminar.");
      await load();
      setSelectedId(created.id);
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  async function saveKey(event: FormEvent) {
    event.preventDefault();
    if (keyBusy || !keyInput.trim()) return;
    setKeyBusy(true); setError(""); setSuccess("");
    try {
      setStatus(await api.mutate<MapsStatus>("/maps/key", "PUT", { api_key: keyInput.trim() }));
      setKeyInput(""); setSuccess("Chave salva. O Maps já pode ser usado.");
      await load();
    } catch (e) { setError(message(e)); }
    finally { setKeyBusy(false); }
  }
  async function removeKey() {
    if (keyBusy) return;
    setKeyBusy(true); setError(""); setSuccess("");
    try {
      setStatus(await api.mutate<MapsStatus>("/maps/key", "DELETE"));
      setSuccess("Chave removida do painel."); setSelectedId("");
      await load();
    } catch (e) { setError(message(e)); }
    finally { setKeyBusy(false); }
  }
  async function remove() {
    if (!deleting || busy) return;
    setBusy(true); setError("");
    try {
      await api.mutate(`/maps/jobs/${deleting.id}`, "DELETE");
      if (selectedId === deleting.id) setSelectedId("");
      setDeleting(null); setSuccess("Busca excluída.");
      await load();
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  async function addToFunnel(leads: Lead[], busyKey: string) {
    if (adding || !leads.length) return;
    setAdding(busyKey); setError(""); setSuccess("");
    try {
      let created = 0, skipped = 0;
      const done = new Set(added);
      for (let start = 0; start < leads.length; start += 200) {
        const chunk = leads.slice(start, start + 200);
        const result = await api.mutate<{ created: number; skipped: number; items: string[] }>("/maps/funnel", "POST", { niche: leadNiche, leads: chunk });
        created += result.created; skipped += result.skipped;
        chunk.forEach(lead => done.add(leadKey(lead)));
        setAdded(new Set(done));
      }
      setSuccess(`${created} lead(s) adicionados ao funil${skipped ? `; ${skipped} já estavam cadastrados` : ""}.`);
    } catch (e) { setError(message(e)); }
    finally { setAdding(null); }
  }
  function download() {
    const url = URL.createObjectURL(csvFile(visible));
    const link = document.createElement("a");
    link.href = url; link.download = `maps-${(selected?.name || "resultados").replace(/[^\w-]+/g, "-").toLowerCase()}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (!jobs) return <Loading />;
  const sorted = jobs;
  return <section className="flex flex-col gap-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">Maps</h1>
        <p className="text-sm text-muted-foreground">Encontre empresas no Google Maps por segmento e região, com telefone, site e avaliações.</p></div>
      <Button variant="outline" onClick={() => void load()}><RefreshCw data-icon="inline-start" /> Atualizar</Button>
    </div>
    <Feedback error={error} success={success} />

    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2"><KeyRound className="size-4" /> Chave de API do Maps
          <Badge variant={status?.configured ? "default" : "destructive"}>{status?.configured ? "Configurada" : "Não configurada"}</Badge></CardTitle>
        <CardDescription>{status?.configured
          ? `Em uso: ${status.key_prefix ?? "chave"}… ${status.source === "panel" ? `(${status.own ? "sua chave" : "chave compartilhada"}, salva no painel${status.updated_at ? ` em ${dateLabel(status.updated_at)}` : ""})` : "(definida no servidor, variável MAPS_API_KEY)"}.`
          : "O Maps usa a sua chave de API da Nexo para falar com o servidor de buscas. Crie uma na página Chaves (ou API, para devs) e cole aqui."}</CardDescription>
      </CardHeader>
      {canManageKey ? <CardContent>
        <form onSubmit={event => void saveKey(event)} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <TextField label={status?.configured ? "Trocar chave" : "Chave de API"} type="password" autoComplete="off" spellCheck={false}
              placeholder="nexo_live_…" value={keyInput} maxLength={160} onChange={event => setKeyInput(event.target.value)}
              help="A chave é testada no servidor do Maps antes de ser salva e fica guardada criptografada." />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={keyBusy || !keyInput.trim()}>{keyBusy ? <Busy>Salvando…</Busy> : "Salvar chave"}</Button>
            {status?.source === "panel" && <Button type="button" variant="outline" disabled={keyBusy} onClick={() => void removeKey()}>Remover</Button>}
          </div>
        </form>
      </CardContent> : !status?.configured && <CardContent><Alert><AlertTitle>Peça a um administrador</AlertTitle>
        <AlertDescription>Somente Dev, Admin e Owner podem cadastrar a chave do Maps.</AlertDescription></Alert></CardContent>}
    </Card>

    {status?.configured && <div className="grid gap-5 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5">
      <Card>
        <CardHeader><CardTitle>Nichos da Nexo</CardTitle>
          <CardDescription>Escolha o nicho que você quer prospectar. A busca já usa os termos certos para ele.</CardDescription></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Nichos disponíveis">
            {NICHES.map(niche => <Button key={niche} type="button" size="sm" variant={form.niche === niche ? "default" : "outline"}
              aria-pressed={form.niche === niche} onClick={() => setForm({ ...form, niche })}>{niche}</Button>)}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Vai buscar por: {(NICHE_SEARCH[form.niche] ?? []).join(", ")}.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Nova busca</CardTitle>
          <CardDescription>Buscas grandes levam alguns minutos e consomem recursos do servidor. Comece pela profundidade normal.</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={event => void submit(event)} className="flex flex-col gap-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="maps-city">Cidade</FieldLabel>
                <NativeSelect id="maps-city" value={form.city} onChange={event => pickCity(event.target.value)}>
                  {CITIES.map(city => <NativeSelectOption key={city.name} value={city.name}>{city.name}</NativeSelectOption>)}
                  <NativeSelectOption value="">Outro local (informar coordenadas)</NativeSelectOption>
                </NativeSelect>
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <TextField label="Latitude" inputMode="decimal" value={form.lat} onChange={event => setForm({ ...form, lat: event.target.value, city: "" })} />
                <TextField label="Longitude" inputMode="decimal" value={form.lon} onChange={event => setForm({ ...form, lon: event.target.value, city: "" })} />
                <TextField label="Raio (m)" inputMode="numeric" value={form.radius} onChange={event => setForm({ ...form, radius: event.target.value })} />
              </div>
              <Field>
                <FieldLabel htmlFor="maps-limit">Limite de clientes</FieldLabel>
                <NativeSelect id="maps-limit" value={String(form.limit)} onChange={event => setForm({ ...form, limit: Number(event.target.value) })}>
                  {LIMITS.map(item => <NativeSelectOption key={item} value={String(item)}>{item} clientes</NativeSelectOption>)}
                </NativeSelect>
                <FieldDescription>Quantas empresas mostrar e poder adicionar ao funil desta busca.</FieldDescription>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="maps-depth">Profundidade</FieldLabel>
                  <NativeSelect id="maps-depth" value={String(form.depth)} onChange={event => setForm({ ...form, depth: Number(event.target.value) })}>
                    {DEPTHS.map(item => <NativeSelectOption key={item.value} value={String(item.value)}>{item.label}</NativeSelectOption>)}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="maps-duration">Tempo máximo</FieldLabel>
                  <NativeSelect id="maps-duration" value={String(form.duration)} onChange={event => setForm({ ...form, duration: Number(event.target.value) })}>
                    {DURATIONS.map(item => <NativeSelectOption key={item.value} value={String(item.value)}>{item.label}</NativeSelectOption>)}
                  </NativeSelect>
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="maps-lang">Idioma</FieldLabel>
                  <NativeSelect id="maps-lang" value={form.lang} onChange={event => setForm({ ...form, lang: event.target.value })}>
                    <NativeSelectOption value="pt">Português</NativeSelectOption>
                    <NativeSelectOption value="en">Inglês</NativeSelectOption>
                    <NativeSelectOption value="es">Espanhol</NativeSelectOption>
                  </NativeSelect>
                </Field>
                <TextField label="Nome da busca (opcional)" maxLength={80} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} />
              </div>
              <Field orientation="horizontal">
                <Switch id="maps-email" checked={form.email} onCheckedChange={checked => setForm({ ...form, email: checked })} />
                <FieldLabel htmlFor="maps-email">Buscar e-mails nos sites das empresas</FieldLabel>
              </Field>
              <FieldDescription>Deixa a busca mais lenta, mas traz o contato que mais interessa para prospecção.</FieldDescription>
              <Field orientation="horizontal">
                <Switch id="maps-fast" checked={form.fast} onCheckedChange={checked => setForm({ ...form, fast: checked })} />
                <FieldLabel htmlFor="maps-fast">Modo rápido (menos detalhes por empresa)</FieldLabel>
              </Field>
            </FieldGroup>
            <div><Button type="submit" disabled={busy}>{busy ? <Busy>Iniciando…</Busy> : <><Search data-icon="inline-start" /> Buscar</>}</Button></div>
          </form>
        </CardContent>
      </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Buscas</CardTitle>
          <CardDescription>{hasActive ? "Atualizando automaticamente enquanto há busca em andamento." : "Selecione uma busca para ver os resultados."}</CardDescription></CardHeader>
        <CardContent>
          {sorted.length === 0 ? <Empty>
            <EmptyHeader><EmptyMedia variant="icon"><MapPin /></EmptyMedia><EmptyTitle>Nenhuma busca ainda</EmptyTitle>
              <EmptyDescription>Preencha o formulário e clique em Buscar.</EmptyDescription></EmptyHeader>
          </Empty> : <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto" aria-label="Buscas">
            {sorted.map(job => {
              const status = statusOf(job.status);
              return <li key={job.id} className="flex items-center gap-2">
                <Button variant={job.id === selectedId ? "secondary" : "outline"} className="h-auto min-w-0 flex-1 justify-between gap-3 py-2 text-left"
                  onClick={() => setSelectedId(job.id)} aria-pressed={job.id === selectedId}>
                  <span className="min-w-0"><span className="block truncate font-medium">{job.name || "Sem nome"}</span>
                    <span className="block text-xs font-normal text-muted-foreground">{dateLabel(job.created_at)}</span></span>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setDeleting(job)} aria-label={`Excluir busca ${job.name || job.id}`}><Trash2 /></Button>
              </li>;
            })}
          </ul>}
        </CardContent>
      </Card>
    </div>}

    {status?.configured && selected && <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">{selected.name || "Busca"} <Badge variant={statusOf(selected.status).variant}>{statusOf(selected.status).label}</Badge></CardTitle>
        <CardDescription>{selected.status === "ok" ? (results ? `${results.total} empresa(s) nova(s) encontradas${results.in_funnel ? `; ${results.in_funnel} já estavam no funil e foram ocultadas` : ""}${results.truncated ? `; mostrando as primeiras ${results.rows.length}` : ""}.` : "Carregando resultados…")
          : ACTIVE.has(selected.status) ? "A busca está rodando. Esta tela atualiza sozinha." : "A busca não terminou com sucesso. Tente novamente com outra região ou menos profundidade."}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {resultsLoading && <Loading />}
        {results && <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[14rem] flex-1"><Input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Filtrar por nome, categoria, endereço…" aria-label="Filtrar resultados" /></div>
            <Field orientation="horizontal" className="w-auto"><Switch id="maps-phone" checked={onlyPhone} onCheckedChange={setOnlyPhone} /><FieldLabel htmlFor="maps-phone">Só com telefone</FieldLabel></Field>
            <Button variant="outline" disabled={!visible.length} onClick={download}><Download data-icon="inline-start" /> Baixar CSV ({visible.length})</Button>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <Field className="w-auto">
                <FieldLabel htmlFor="maps-lead-niche">Nicho dos leads no funil</FieldLabel>
                <NativeSelect id="maps-lead-niche" value={leadNiche} onChange={event => setLeadNiche(event.target.value)}>
                  {NICHES.map(niche => <NativeSelectOption key={niche} value={niche}>{niche}</NativeSelectOption>)}
                </NativeSelect>
              </Field>
              <Field className="w-auto">
                <FieldLabel htmlFor="maps-result-limit">Mostrar</FieldLabel>
                <NativeSelect id="maps-result-limit" value={String(resultLimit)} onChange={event => setResultLimit(Number(event.target.value))}>
                  <NativeSelectOption value="0">Todos</NativeSelectOption>
                  {LIMITS.map(item => <NativeSelectOption key={item} value={String(item)}>{item} clientes</NativeSelectOption>)}
                </NativeSelect>
              </Field>
            </div>
            <Button disabled={adding !== null || pending.length === 0} onClick={() => void addToFunnel(pending, "all")}>
              {adding === "all" ? <Busy>Adicionando…</Busy> : <><ListPlus data-icon="inline-start" /> Adicionar todos no funil ({pending.length})</>}
            </Button>
          </div>
          {visible.length === 0 ? <Empty><EmptyHeader><EmptyTitle>Nada encontrado</EmptyTitle>
            <EmptyDescription>Nenhuma empresa corresponde aos filtros atuais.</EmptyDescription></EmptyHeader></Empty> :
            <div className="max-h-[32rem] overflow-auto rounded-md border">
              <Table>
                <TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead>Contato</TableHead><TableHead>Nota</TableHead><TableHead>Endereço</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
                <TableBody>{visible.map((row, index) => <TableRow key={`${row.link ?? row.title}-${index}`}>
                  <TableCell className="max-w-64 whitespace-normal"><p className="font-medium">{row.link ? <a className="underline-offset-4 hover:underline" href={row.link} target="_blank" rel="noopener noreferrer">{row.title || "Sem nome"}</a> : row.title || "Sem nome"}</p>
                    {row.category && <p className="text-xs text-muted-foreground">{row.category}</p>}</TableCell>
                  <TableCell className="max-w-64 whitespace-normal text-sm">
                    {row.phone && <p>{row.phone}</p>}
                    {row.emails && <p className="break-all">{row.emails}</p>}
                    {row.website && <p className="truncate"><a className="underline-offset-4 hover:underline" href={/^https?:\/\//i.test(row.website) ? row.website : undefined} target="_blank" rel="noopener noreferrer">{row.website.replace(/^https?:\/\/(www\.)?/i, "")}</a></p>}
                    {!row.phone && !row.emails && !row.website && <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{row.review_rating !== null ? <>{row.review_rating.toFixed(1)} <span className="text-muted-foreground">({row.review_count ?? 0})</span></> : "—"}</TableCell>
                  <TableCell className="max-w-72 whitespace-normal text-sm text-muted-foreground">{row.address || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex flex-wrap gap-2">
                      {(() => {
                        const url = mapsUrl({ latitude: row.latitude, longitude: row.longitude, query: [row.title, row.address].filter(Boolean).join(" ") });
                        return url ? <MapsButton href={url} label={`Ver ${row.title || "empresa"} no mapa`} /> : null;
                      })()}
                      {added.has(leadKey(row)) ? <Button size="sm" variant="secondary" disabled><Check data-icon="inline-start" /> No funil</Button>
                        : <Button size="sm" disabled={adding !== null || !row.title} onClick={() => void addToFunnel([row], leadKey(row))} aria-label={`Adicionar ${row.title || "empresa"} ao funil`}>
                          {adding === leadKey(row) ? <Busy>Salvando…</Busy> : <><ListPlus data-icon="inline-start" /> Adicionar ao funil</>}
                        </Button>}
                    </div>
                  </TableCell>
                </TableRow>)}</TableBody>
              </Table>
            </div>}
        </>}
      </CardContent>
    </Card>}

    <Dialog open={deleting !== null} onOpenChange={open => { if (!open && !busy) setDeleting(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Excluir esta busca?</DialogTitle>
          <DialogDescription>{deleting?.name || "A busca"} e os resultados dela serão apagados do servidor do Maps. Baixe o CSV antes se precisar dos dados.</DialogDescription></DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>Cancelar</Button>
          <Button variant="destructive" disabled={busy} onClick={() => void remove()}>{busy ? <Busy>Excluindo…</Busy> : "Excluir"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
