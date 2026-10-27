import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Download, KeyRound, ListPlus, MapPin, Check, Clock3, Plus, RefreshCw, Search, Trash2, Undo2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, CLIENT_NICHES, type createApi } from "./api";
import { mapsUrl } from "./contact";
import { CONTACT_CHOICES, channelFor, contactParts, instagramHandle, instagramUrl, matchesContact, needsEmailSearch, siteUrl, type ContactChoice } from "./leadContact";
import { MapsButton } from "./MapsLink";
import { Busy, Feedback, Field, FieldGroup, FieldLabel, Loading, TextField, message } from "./shared";

type MapsStatus = { configured: boolean; source: "panel" | "environment" | null; key_prefix: string | null; updated_at: string | null; own?: boolean };
type Job = { id: string; name: string; status: string; created_at: string | null };
type Lead = {
  title: string | null; category: string | null; address: string | null; phone: string | null;
  website: string | null; emails: string | null; review_rating: number | null; review_count: number | null;
  link: string | null; latitude: number | null; longitude: number | null;
};
type BatchStatus = { id: string; total: number; done: number; created: number; skipped: number; failed: number; finished: boolean; items: string[] };
type Batch = { id: string; jobId: string; keys: string[]; status?: BatchStatus };
const BATCH_KEY = "nexo-maps-batch";
const saveBatch = (batch: Batch) => { try { localStorage.setItem(BATCH_KEY, JSON.stringify({ id: batch.id, jobId: batch.jobId, keys: batch.keys })); } catch { /* sem armazenamento */ } };
const clearBatch = () => { try { localStorage.removeItem(BATCH_KEY); } catch { /* sem armazenamento */ } };
const savedBatch = (): Batch | null => { try { const raw = localStorage.getItem(BATCH_KEY); return raw ? JSON.parse(raw) as Batch : null; } catch { return null; } };
type Results = {
  rows: Lead[]; total: number; truncated: boolean; in_funnel: number;
  // Filled for searches started in the panel: the radius now, where it started and the wider search that replaced it.
  auto_expand?: boolean; radius?: number | null; start_radius?: number | null; expanded_to?: string | null;
};
const DEFAULT_RADIUS = "5000";
const km = (meters: number) => `${(meters / 1000).toLocaleString("pt-BR")} km`;

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
type JobMeta = { niche?: string; limit?: number; contact?: ContactChoice };
const isContactChoice = (value: unknown): value is ContactChoice => CONTACT_CHOICES.some(choice => choice.value === value);
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

function csvFile(rows: Lead[], choice: ContactChoice) {
  const parts = contactParts(choice);
  const all: [keyof Lead, string, boolean][] = [["title", "Nome", true], ["category", "Categoria", true], ["phone", "Telefone", parts.phone], ["website", "Site ou Instagram", parts.site || parts.instagram],
    ["emails", "E-mails", parts.email], ["review_rating", "Nota", true], ["review_count", "Avaliações", true], ["address", "Endereço", true], ["link", "Link no Maps", true]];
  const columns = all.filter(([, , shown]) => shown).map(([key, label]) => [key, label] as [keyof Lead, string]);
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
  const [contact, setContact] = useState<ContactChoice>("any");
  // Latitude, longitude and radius stay hidden until the button is pressed: by default the city is searched and the radius grows by itself.
  const [customPlace, setCustomPlace] = useState(false);
  const [deleting, setDeleting] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [batch, setBatch] = useState<Batch | null>(null);
  const [leadNiche, setLeadNiche] = useState<string>(NICHES[0]);
  const [resultLimit, setResultLimit] = useState(0);
  const [form, setForm] = useState({
    name: "", niche: NICHES[0] as string, limit: 20, city: CITIES[0].name, lat: CITIES[0].lat, lon: CITIES[0].lon, radius: "5000",
    depth: 3, lang: "pt", duration: 300, email: false, fast: false, contact: "any" as ContactChoice,
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
    setResults(undefined); setFilter(""); setContact("any"); setAdded(new Set()); setExisting(new Set()); setFailed(new Set());
    const meta = readJobMeta()[selectedId];
    setResultLimit(meta?.limit ?? 0);
    if (isContactChoice(meta?.contact)) setContact(meta.contact);
    if (meta?.niche && NICHES.some(niche => niche === meta.niche)) setLeadNiche(meta.niche);
    if (!selectedId || selectedStatus !== "ok") return;
    let active = true;
    setResultsLoading(true);
    api.request<Results>(`/maps/jobs/${selectedId}/results`)
      .then(async data => {
        if (!active) return;
        setResults(data);
        if (data.expanded_to && data.radius) {
          // Nothing was found: the server already started the same search with a bigger radius, so follow it.
          saveJobMeta(data.expanded_to, readJobMeta()[selectedId] ?? {});
          setSuccess(`Nenhuma empresa em ${km(data.radius)}. Ampliando a busca para ${km(Math.min(data.radius * 2, 50000))}…`);
          await load();
          if (active) setSelectedId(data.expanded_to);
        }
      })
      .catch(e => { if (active) setError(message(e)); })
      .finally(() => { if (active) setResultsLoading(false); });
    return () => { active = false; };
  }, [api, load, selectedId, selectedStatus]);

  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase();
    const matching = (results?.rows ?? []).filter(row =>
      matchesContact(row, contact) &&
      (!term || [row.title, row.category, row.address, row.phone, row.website, row.emails].some(value => value?.toLowerCase().includes(term))));
    return resultLimit > 0 ? matching.slice(0, resultLimit) : matching;
  }, [results, filter, contact, resultLimit]);
  const pending = visible.filter(row => row.title && !added.has(leadKey(row)) && !existing.has(leadKey(row)));

  function useDefaultPlace() {
    setCustomPlace(false);
    setForm(current => {
      const city = CITIES.find(item => item.name === current.city) ?? CITIES[0];
      return { ...current, city: city.name, lat: city.lat, lon: city.lon, radius: DEFAULT_RADIUS };
    });
  }
  function pickCity(name: string) {
    const city = CITIES.find(item => item.name === name);
    setForm(current => city ? { ...current, city: name, lat: city.lat, lon: city.lon } : { ...current, city: "" });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const keywords = NICHE_SEARCH[form.niche] ?? [];
    const lat = Number(form.lat), lon = Number(form.lon), radius = Number(form.radius);
    const expand = !customPlace; // the default place widens by itself; a place typed by the user is searched only there
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
        email: form.email || needsEmailSearch(form.contact), fast_mode: form.fast, auto_expand: expand,
      });
      saveJobMeta(created.id, { niche: form.niche, limit: form.limit, contact: form.contact });
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
  // The server saves each lead as its own background task; this follows its progress until every lead is done.
  async function addLeads(leads: Lead[]) {
    if (batch || !leads.length) return;
    setError(""); setSuccess("");
    const keys = leads.map(leadKey);
    setFailed(current => { const next = new Set(current); keys.forEach(key => next.delete(key)); return next; });
    setBatch({ id: "", jobId: selectedId, keys });
    try {
      const started = await api.mutate<BatchStatus>("/maps/funnel/batches", "POST", { niche: leadNiche, leads, sales_channel: channelFor(contact) });
      const next: Batch = { id: started.id, jobId: selectedId, keys, status: started };
      setBatch(next); saveBatch(next);
    } catch (e) { setError(message(e)); setBatch(null); }
  }
  const batchId = batch?.id;
  const batchKeys = useRef<string[]>([]);
  batchKeys.current = batch?.keys ?? batchKeys.current;
  useEffect(() => {
    if (!batchId) return;
    let active = true;
    async function tick() {
      try {
        api.invalidate(); // progress must never come from the read cache
        const status = await api.request<BatchStatus>(`/maps/funnel/batches/${batchId}`);
        if (!active) return;
        // Leads already finished keep their final state even after the batch ends.
        const keysWith = (target: string) => batchKeys.current.filter((_, index) => status.items[index] === target);
        const merge = (extra: string[]) => (old: Set<string>) => new Set([...old, ...extra]);
        setAdded(merge(keysWith("created"))); setExisting(merge(keysWith("duplicate"))); setFailed(merge(keysWith("failed")));
        setBatch(current => current && current.id === batchId ? { ...current, status } : current);
        if (status.finished) {
          clearBatch(); setBatch(null);
          setSuccess(`${status.created} lead(s) adicionados ao funil${status.skipped ? `; ${status.skipped} já estavam cadastrados` : ""}${status.failed ? `; ${status.failed} falharam` : ""}.`);
        }
      } catch (e) {
        if (!active) return;
        clearBatch(); setBatch(null);
        setError(e instanceof ApiError && e.status === 404 ? "O acompanhamento expirou. Os leads já adicionados aparecem como clientes no funil." : message(e));
      }
    }
    void tick();
    const timer = window.setInterval(() => void tick(), 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, [api, batchId]);
  // Coming back to a search while its leads are still being saved resumes the progress.
  useEffect(() => {
    if (!results || batch) return;
    const saved = savedBatch();
    if (saved && saved.jobId === selectedId && saved.id) setBatch(saved);
  }, [results, selectedId, batch]);
  const leadState = (row: Lead) => {
    const key = leadKey(row);
    if (added.has(key)) return "added";
    if (existing.has(key)) return "existing";
    const index = batch ? batch.keys.indexOf(key) : -1;
    if (batch && index >= 0) {
      const item = batch.status?.items[index] ?? "queued";
      return item === "processing" || (item === "queued" && batch.keys.length === 1) ? "processing" : item === "queued" ? "queued" : "idle";
    }
    return failed.has(key) ? "failed" : "idle";
  };
  function download() {
    const url = URL.createObjectURL(csvFile(visible, contact));
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
                  {customPlace && !form.city && <NativeSelectOption value="">Local personalizado</NativeSelectOption>}
                </NativeSelect>
                {!customPlace && <FieldDescription>Se a busca não achar nenhuma empresa, o raio cresce sozinho (5, 10, 20, 40 e até 50 km) até achar.</FieldDescription>}
              </Field>
              {customPlace ? <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <TextField label="Latitude" inputMode="decimal" value={form.lat} onChange={event => setForm({ ...form, lat: event.target.value, city: "" })} />
                  <TextField label="Longitude" inputMode="decimal" value={form.lon} onChange={event => setForm({ ...form, lon: event.target.value, city: "" })} />
                  <TextField label="Raio (m)" inputMode="numeric" value={form.radius} onChange={event => setForm({ ...form, radius: event.target.value })} />
                </div>
                <FieldDescription>A busca vai só nesse perímetro, sem ampliar o raio.</FieldDescription>
                <div><Button type="button" variant="outline" size="sm" onClick={useDefaultPlace}><Undo2 data-icon="inline-start" /> Voltar ao local padrão</Button></div>
              </> : <div><Button type="button" variant="outline" size="sm" onClick={() => setCustomPlace(true)}><Plus data-icon="inline-start" /> Adicionar latitude, longitude e raio</Button></div>}
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
              <Field>
                <FieldLabel htmlFor="maps-contact">Contato que você quer nos leads</FieldLabel>
                <NativeSelect id="maps-contact" value={form.contact} onChange={event => setForm({ ...form, contact: event.target.value as ContactChoice })}>
                  {CONTACT_CHOICES.map(choice => <NativeSelectOption key={choice.value} value={choice.value}>{choice.label}</NativeSelectOption>)}
                </NativeSelect>
                <FieldDescription>A tela e o CSV mostram só o contato escolhido; "Todos os contatos" mostra tudo. WhatsApp conta só celular (telefone fixo quase nunca tem WhatsApp). Instagram e Site saem do site cadastrado no Maps: se for link do Instagram, conta como Instagram; Facebook e links de redes sociais não contam como site. Ao escolher e-mail, a busca lê os sites das empresas. O contato escolhido vira o canal de vendas dos leads que você adicionar (WhatsApp, e-mail ou Instagram).</FieldDescription>
              </Field>
              <Field orientation="horizontal">
                <Switch id="maps-email" checked={form.email || needsEmailSearch(form.contact)} disabled={needsEmailSearch(form.contact)} onCheckedChange={checked => setForm({ ...form, email: checked })} />
                <FieldLabel htmlFor="maps-email">Buscar e-mails nos sites das empresas</FieldLabel>
              </Field>
              <FieldDescription>Deixa a busca mais lenta, mas traz o contato que mais interessa para prospecção.</FieldDescription>
              <Field orientation="horizontal">
                <Switch id="maps-fast" checked={form.fast} onCheckedChange={checked => setForm({ ...form, fast: checked })} />
                <FieldLabel htmlFor="maps-fast">Modo rápido (menos detalhes por empresa)</FieldLabel>
              </Field>
            </FieldGroup>
            <div><Button type="submit" disabled={busy}>{busy ? <><Spinner data-icon="inline-start" /> Iniciando…</> : <><Search data-icon="inline-start" /> Buscar</>}</Button></div>
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
                  <Badge variant={status.variant}>{ACTIVE.has(job.status) && <Spinner data-icon="inline-start" />}{status.label}</Badge>
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
        {ACTIVE.has(selected.status) && <Empty><EmptyHeader><EmptyMedia variant="icon"><Spinner className="size-6" aria-label="Buscando empresas" /></EmptyMedia>
          <EmptyTitle>Buscando empresas…</EmptyTitle>
          <EmptyDescription>Isso pode levar alguns minutos. Esta tela atualiza sozinha e você recebe um aviso quando a busca terminar.</EmptyDescription></EmptyHeader></Empty>}
        {resultsLoading && <Loading />}
        {results && <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[14rem] flex-1"><Input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Filtrar por nome, categoria, endereço…" aria-label="Filtrar resultados" /></div>
            <Field orientation="horizontal" className="w-auto">
              <FieldLabel htmlFor="maps-result-contact">Contato</FieldLabel>
              <NativeSelect id="maps-result-contact" value={contact} onChange={event => setContact(event.target.value as ContactChoice)}>
                {CONTACT_CHOICES.map(choice => <NativeSelectOption key={choice.value} value={choice.value}>{choice.label}</NativeSelectOption>)}
              </NativeSelect>
            </Field>
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
            <Button disabled={batch !== null || pending.length === 0} onClick={() => void addLeads(pending)}>
              {batch && batch.keys.length > 1 ? <><Spinner data-icon="inline-start" /> Adicionando…</> : <><ListPlus data-icon="inline-start" /> Adicionar todos no funil ({pending.length})</>}
            </Button>
          </div>
          {batch && batch.keys.length > 1 && <div className="flex flex-col gap-2" role="status" aria-live="polite">
            <div className="flex items-center justify-between text-sm"><span>Adicionando leads ao funil…</span><span className="text-muted-foreground">{batch.status?.done ?? 0} de {batch.keys.length}</span></div>
            <Progress value={((batch.status?.done ?? 0) / batch.keys.length) * 100} aria-label="Andamento da adição ao funil" />
          </div>}
          {results.radius && results.start_radius && results.radius > results.start_radius &&
            <Alert><AlertTitle>Raio ampliado</AlertTitle><AlertDescription>As buscas menores não acharam empresas. Esta cobre {km(results.radius)} (começou em {km(results.start_radius)}).</AlertDescription></Alert>}
          {results.total === 0 && results.in_funnel === 0 ? <Empty><EmptyHeader><EmptyMedia variant="icon"><MapPin /></EmptyMedia><EmptyTitle>Nenhuma empresa encontrada</EmptyTitle>
            <EmptyDescription>{results.expanded_to ? "Ampliando a busca para um raio maior…"
              : results.auto_expand && (results.radius ?? 0) >= 50000 ? `Nem ampliando o raio até ${km(results.radius ?? 50000)}. Tente outro nicho ou outra cidade.`
              : results.auto_expand ? "A busca ainda não foi ampliada. Atualize a tela em instantes."
              : results.radius ? `A busca foi só em ${km(results.radius)} ao redor do ponto informado. Aumente o raio ou tente outro nicho ou cidade.`
              : "Tente outro nicho ou outra cidade."}</EmptyDescription></EmptyHeader></Empty>
          : visible.length === 0 ? <Empty><EmptyHeader><EmptyTitle>Nada encontrado</EmptyTitle>
            <EmptyDescription>Nenhuma empresa corresponde aos filtros atuais.</EmptyDescription></EmptyHeader></Empty> :
            <div className="max-h-[32rem] overflow-auto rounded-md border">
              <Table>
                <TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead>Contato</TableHead><TableHead>Nota</TableHead><TableHead>Endereço</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
                <TableBody>{visible.map((row, index) => <TableRow key={`${row.link ?? row.title}-${index}`}>
                  <TableCell className="max-w-64 whitespace-normal"><p className="font-medium">{row.link ? <a className="underline-offset-4 hover:underline" href={row.link} target="_blank" rel="noopener noreferrer">{row.title || "Sem nome"}</a> : row.title || "Sem nome"}</p>
                    {row.category && <p className="text-xs text-muted-foreground">{row.category}</p>}</TableCell>
                  <TableCell className="max-w-64 whitespace-normal text-sm">
                    {(() => {
                      const parts = contactParts(contact);
                      const instagram = parts.instagram ? instagramUrl(row.website) : null;
                      const site = parts.site ? (contact === "any" && !instagramUrl(row.website) ? row.website?.trim() || null : siteUrl(row.website)) : null;
                      const shown = [parts.phone && row.phone, parts.email && row.emails, instagram, site].some(Boolean);
                      return <>
                        {parts.phone && row.phone && <p>{row.phone}</p>}
                        {parts.email && row.emails && <p className="break-all">{row.emails}</p>}
                        {instagram && <p className="truncate"><a className="underline-offset-4 hover:underline" href={/^https?:\/\//i.test(instagram) ? instagram : undefined} target="_blank" rel="noopener noreferrer">Instagram: {instagramHandle(instagram)}</a></p>}
                        {site && <p className="truncate"><a className="underline-offset-4 hover:underline" href={/^https?:\/\//i.test(site) ? site : undefined} target="_blank" rel="noopener noreferrer">{site.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "")}</a></p>}
                        {!shown && <span className="text-muted-foreground">—</span>}
                      </>;
                    })()}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{row.review_rating !== null ? <>{row.review_rating.toFixed(1)} <span className="text-muted-foreground">({row.review_count ?? 0})</span></> : "—"}</TableCell>
                  <TableCell className="max-w-72 whitespace-normal text-sm text-muted-foreground">{row.address || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex flex-wrap gap-2">
                      {(() => {
                        const url = mapsUrl({ latitude: row.latitude, longitude: row.longitude, query: [row.title, row.address].filter(Boolean).join(" ") });
                        return url ? <MapsButton href={url} label={`Ver ${row.title || "empresa"} no mapa`} /> : null;
                      })()}
                      {(() => {
                        const state = leadState(row);
                        if (state === "added") return <Button size="sm" variant="secondary" disabled><Check data-icon="inline-start" /> Adicionado!</Button>;
                        if (state === "existing") return <Button size="sm" variant="secondary" disabled><Check data-icon="inline-start" /> Já estava no funil</Button>;
                        if (state === "processing") return <span className="flex h-8 min-w-40 items-center justify-center"><Spinner aria-label={`Adicionando ${row.title || "empresa"} ao funil`} /></span>;
                        if (state === "queued") return <span className="flex h-8 min-w-40 items-center justify-center gap-2 text-xs text-muted-foreground"><Clock3 className="size-3.5" aria-hidden="true" /> Na fila</span>;
                        return <>
                          {state === "failed" && <Badge variant="destructive">Falhou</Badge>}
                          <Button size="sm" disabled={batch !== null || !row.title} onClick={() => void addLeads([row])} aria-label={`Adicionar ${row.title || "empresa"} ao funil`}>
                            <ListPlus data-icon="inline-start" /> {state === "failed" ? "Tentar de novo" : "Adicionar ao funil"}
                          </Button>
                        </>;
                      })()}
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
