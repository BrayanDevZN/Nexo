import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Clapperboard, Code2, Download, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type createApi } from "./api";
import { Feedback, Field, FieldGroup, FieldLabel, Loading, message } from "./shared";

type Aspect = "landscape" | "vertical" | "square";
type Quality = "draft" | "standard" | "high";
type VideoJob = {
  id: string; status: string; source: "html" | "prompt"; prompt: string | null; error: string | null;
  fps: number; quality: Quality; duration_seconds: number | null; file_size: number | null;
  created_at: string; updated_at: string; video_url: string | null;
};
type VideoDetail = VideoJob & { html: string | null };

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  queued: { label: "Na fila", variant: "secondary" },
  generating: { label: "IA escrevendo", variant: "secondary" },
  rendering: { label: "Renderizando", variant: "secondary" },
  done: { label: "Pronto", variant: "default" },
  failed: { label: "Falhou", variant: "destructive" },
};
const ACTIVE = new Set(["queued", "generating", "rendering"]);
const POLL_MS = 3000;
const ASPECTS: { value: Aspect; label: string; hint: string }[] = [
  { value: "landscape", label: "Horizontal", hint: "16:9" },
  { value: "vertical", label: "Vertical", hint: "9:16" },
  { value: "square", label: "Quadrado", hint: "1:1" },
];
const QUALITIES: { value: Quality; label: string }[] = [
  { value: "draft", label: "Rápida (rascunho)" }, { value: "standard", label: "Padrão" }, { value: "high", label: "Alta" },
];
const HTML_EXAMPLE = `<!doctype html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0}
#root{position:relative;width:1920px;height:1080px;overflow:hidden;background:#0b1020;font-family:Inter,sans-serif;color:#fff}
#title{position:absolute;left:160px;top:420px;font-size:120px;font-weight:700}
</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="3" data-width="1920" data-height="1080">
  <h1 id="title" class="clip" data-start="0" data-duration="3" data-track-index="0">Oferta especial</h1>
</div>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
<script>
const tl = gsap.timeline({ paused: true });
tl.from("#title", { opacity: 0, y: 60, duration: 0.8 }, 0.2);
window.__timelines = window.__timelines || {};
window.__timelines["main"] = tl;
</script></body></html>`;

const statusOf = (status: string) => STATUS[status] ?? { label: status || "Desconhecido", variant: "outline" as const };
const dateLabel = (value: string | null) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
};
const sizeLabel = (bytes: number | null) => bytes === null ? "" : bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const titleOf = (job: VideoJob) => job.source === "prompt" ? job.prompt || "Vídeo por IA" : "Vídeo a partir de HTML";

/** Videos made from a description (the AI writes the HTML) or from an HTML composition written by hand. */
export function Videos({ api }: { api: ReturnType<typeof createApi> }) {
  const [jobs, setJobs] = useState<VideoJob[]>();
  const [selectedId, setSelectedId] = useState<string>();
  const [detail, setDetail] = useState<VideoDetail>();
  const [videoUrl, setVideoUrl] = useState<string>();
  const [mode, setMode] = useState("ai");
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<Aspect>("landscape");
  const [seconds, setSeconds] = useState("15");
  const [quality, setQuality] = useState<Quality>("standard");
  const [html, setHtml] = useState("");
  const [fps, setFps] = useState("30");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    try { api.invalidate(); setJobs(await api.request<VideoJob[]>("/videos")); setError(""); }
    catch (e) { setError(message(e)); setJobs(current => current ?? []); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);
  const hasActive = !!jobs?.some(job => ACTIVE.has(job.status));
  useEffect(() => {
    if (!hasActive) return;
    const timer = window.setInterval(() => { void load(); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [hasActive, load]);

  const selected = jobs?.find(job => job.id === selectedId) ?? jobs?.[0];
  const selectedStatus = selected?.status;
  useEffect(() => {
    if (!selected) { setDetail(undefined); return; }
    let cancelled = false;
    api.invalidate();
    api.request<VideoDetail>(`/videos/${selected.id}`).then(value => { if (!cancelled) setDetail(value); }).catch(() => { if (!cancelled) setDetail(undefined); });
    return () => { cancelled = true; };
  }, [api, selected?.id, selectedStatus]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setVideoUrl(undefined);
    if (!selected || selected.status !== "done") return;
    let cancelled = false; let url = "";
    api.file(`/videos/${selected.id}/file`).then(blob => { url = URL.createObjectURL(blob); if (cancelled) URL.revokeObjectURL(url); else setVideoUrl(url); })
      .catch(e => { if (!cancelled) setError(message(e)); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [api, selected?.id, selectedStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(event: FormEvent, path: "/videos/generate" | "/videos") {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const body = path === "/videos/generate"
        ? { prompt: prompt.trim(), aspect, seconds: Number(seconds), quality }
        : { html, fps: Number(fps), quality };
      const created = await api.mutate<VideoJob>(path, "POST", body);
      setSelectedId(created.id); await load();
      setSuccess(path === "/videos/generate" ? "Pedido enviado. A IA está escrevendo o vídeo e ele aparece ao lado quando ficar pronto." : "Pedido enviado. O vídeo aparece ao lado quando terminar de renderizar.");
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  function download() {
    if (!videoUrl || !selected) return;
    const link = document.createElement("a");
    link.href = videoUrl; link.download = `nexo-video-${selected.id.slice(0, 8)}.mp4`;
    link.click();
  }
  function editHtml() {
    if (!detail?.html) return;
    setHtml(detail.html); setFps(String(detail.fps)); setQuality(detail.quality); setMode("html");
  }
  function reuse() {
    if (!detail?.prompt) return;
    setPrompt(detail.prompt); setQuality(detail.quality); setMode("ai");
  }

  if (!jobs) return <Loading />;
  const promptValid = prompt.trim().length >= 10;
  const secondsValid = Number.isInteger(Number(seconds)) && Number(seconds) >= 3 && Number(seconds) <= 60;
  const submitLabel = (idle: string, icon: React.ReactNode) => busy ? <><Spinner data-icon="inline-start" /> Enviando…</> : <>{icon} {idle}</>;
  return <section className="flex flex-col gap-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">Vídeos</h1>
        <p className="text-sm text-muted-foreground">Crie vídeos de venda descrevendo o que você quer, ou renderizando uma composição em HTML.</p></div>
      <Button variant="outline" onClick={() => void load()}><RefreshCw data-icon="inline-start" /> Atualizar</Button>
    </div>
    <Feedback error={error} success={success} />

    <div className="grid gap-5 xl:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
      <Card>
        <CardHeader><CardTitle>Novo vídeo</CardTitle>
          <CardDescription>Cada vídeo leva alguns minutos para ficar pronto. Você pode ter até 2 em andamento ao mesmo tempo.</CardDescription></CardHeader>
        <CardContent>
          <Tabs value={mode} onValueChange={setMode}>
            <TabsList>
              <TabsTrigger value="ai"><Sparkles data-icon="inline-start" /> Descrever com IA</TabsTrigger>
              <TabsTrigger value="html"><Code2 data-icon="inline-start" /> Usar HTML</TabsTrigger>
            </TabsList>
            <TabsContent value="ai">
              <form onSubmit={event => void submit(event, "/videos/generate")} className="flex flex-col gap-4 pt-4">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="video-prompt">O que o vídeo deve mostrar</FieldLabel>
                    <Textarea id="video-prompt" rows={6} minLength={10} maxLength={2000} value={prompt} onChange={event => setPrompt(event.target.value)}
                      placeholder="Ex.: Vídeo de 15 segundos vendendo gestão de redes sociais para pizzarias, com o preço R$ 497/mês e chamada para falar no WhatsApp" />
                    <FieldDescription>Conte o produto, o público, a oferta e a chamada para ação. Quanto mais claro, melhor o resultado.</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel id="video-aspect-label">Formato</FieldLabel>
                    <ToggleGroup type="single" variant="outline" value={aspect} aria-labelledby="video-aspect-label"
                      onValueChange={value => { if (value) setAspect(value as Aspect); }}>
                      {ASPECTS.map(item => <ToggleGroupItem key={item.value} value={item.value} aria-label={`${item.label} ${item.hint}`}>{item.label} <span className="text-muted-foreground">{item.hint}</span></ToggleGroupItem>)}
                    </ToggleGroup>
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="video-seconds">Duração (segundos)</FieldLabel>
                      <Input id="video-seconds" type="number" inputMode="numeric" min={3} max={60} value={seconds} aria-invalid={!secondsValid} onChange={event => setSeconds(event.target.value)} />
                      <FieldDescription>De 3 a 60 segundos.</FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="video-quality">Qualidade</FieldLabel>
                      <NativeSelect id="video-quality" value={quality} onChange={event => setQuality(event.target.value as Quality)}>
                        {QUALITIES.map(item => <NativeSelectOption key={item.value} value={item.value}>{item.label}</NativeSelectOption>)}
                      </NativeSelect>
                    </Field>
                  </div>
                </FieldGroup>
                <div><Button type="submit" disabled={busy || !promptValid || !secondsValid}>{submitLabel("Gerar vídeo", <Wand2 data-icon="inline-start" />)}</Button></div>
              </form>
            </TabsContent>
            <TabsContent value="html">
              <form onSubmit={event => void submit(event, "/videos")} className="flex flex-col gap-4 pt-4">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="video-html">Composição em HTML</FieldLabel>
                    <Textarea id="video-html" rows={14} maxLength={300000} spellCheck={false} className="font-mono text-xs" value={html} onChange={event => setHtml(event.target.value)}
                      placeholder="Cole aqui uma composição HyperFrames (HTML com data-composition-id, clipes e uma timeline GSAP)." />
                    <FieldDescription>O vídeo é renderizado exatamente como o HTML descreve. <Button type="button" variant="link" className="h-auto p-0" onClick={() => setHtml(HTML_EXAMPLE)}>Usar um exemplo</Button></FieldDescription>
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="video-fps">Quadros por segundo</FieldLabel>
                      <NativeSelect id="video-fps" value={fps} onChange={event => setFps(event.target.value)}>
                        {["24", "30", "60"].map(value => <NativeSelectOption key={value} value={value}>{value} fps</NativeSelectOption>)}
                      </NativeSelect>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="video-html-quality">Qualidade</FieldLabel>
                      <NativeSelect id="video-html-quality" value={quality} onChange={event => setQuality(event.target.value as Quality)}>
                        {QUALITIES.map(item => <NativeSelectOption key={item.value} value={item.value}>{item.label}</NativeSelectOption>)}
                      </NativeSelect>
                    </Field>
                  </div>
                </FieldGroup>
                <div><Button type="submit" disabled={busy || html.trim().length < 20}>{submitLabel("Renderizar vídeo", <Clapperboard data-icon="inline-start" />)}</Button></div>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Seus vídeos</CardTitle>
          <CardDescription>{hasActive ? "Atualizando automaticamente enquanto há vídeo em andamento." : "Selecione um vídeo para assistir ou baixar."}</CardDescription></CardHeader>
        <CardContent>
          {jobs.length === 0 ? <Empty>
            <EmptyHeader><EmptyMedia variant="icon"><Clapperboard /></EmptyMedia><EmptyTitle>Nenhum vídeo ainda</EmptyTitle>
              <EmptyDescription>Descreva o vídeo ou cole um HTML e clique em gerar.</EmptyDescription></EmptyHeader>
          </Empty> : <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto" aria-label="Vídeos">
            {jobs.map(job => {
              const status = statusOf(job.status);
              return <li key={job.id}>
                <Button variant={job.id === selected?.id ? "secondary" : "outline"} className="h-auto w-full min-w-0 justify-between gap-3 py-2 text-left"
                  onClick={() => setSelectedId(job.id)} aria-pressed={job.id === selected?.id}>
                  <span className="min-w-0"><span className="block truncate font-medium">{titleOf(job)}</span>
                    <span className="block text-xs font-normal text-muted-foreground">{dateLabel(job.created_at)}</span></span>
                  <Badge variant={status.variant}>{ACTIVE.has(job.status) && <Spinner data-icon="inline-start" />}{status.label}</Badge>
                </Button>
              </li>;
            })}
          </ul>}
        </CardContent>
      </Card>
    </div>

    {selected && <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2"><span className="min-w-0 truncate">{titleOf(selected)}</span>
          <Badge variant={statusOf(selected.status).variant}>{statusOf(selected.status).label}</Badge></CardTitle>
        <CardDescription>{[dateLabel(selected.created_at), selected.duration_seconds ? `${selected.duration_seconds.toLocaleString("pt-BR")} s` : "", sizeLabel(selected.file_size)].filter(Boolean).join(" · ")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {ACTIVE.has(selected.status) && <Empty>
          <EmptyHeader><EmptyMedia variant="icon"><Spinner className="size-6" aria-label="Gerando vídeo" /></EmptyMedia>
            <EmptyTitle>{selected.status === "generating" ? "A IA está escrevendo o vídeo…" : selected.status === "rendering" ? "Renderizando o vídeo…" : "Na fila…"}</EmptyTitle>
            <EmptyDescription>Isso pode levar alguns minutos. Esta tela atualiza sozinha.</EmptyDescription></EmptyHeader>
        </Empty>}
        {selected.status === "failed" && <Alert variant="destructive"><AlertTitle>Não foi possível gerar este vídeo</AlertTitle>
          <AlertDescription>{selected.error || "Tente novamente com outra descrição."}</AlertDescription></Alert>}
        {selected.status === "done" && (videoUrl
          ? <video src={videoUrl} controls playsInline className="max-h-[32rem] w-full rounded-lg bg-black" aria-label="Vídeo gerado" />
          : <div className="flex flex-col gap-3"><Loading /></div>)}
        <div className="flex flex-wrap gap-2">
          {selected.status === "done" && <Button onClick={download} disabled={!videoUrl}><Download data-icon="inline-start" /> Baixar MP4</Button>}
          {detail?.html && <Button variant="outline" onClick={editHtml}><Code2 data-icon="inline-start" /> Editar o HTML</Button>}
          {detail?.prompt && <Button variant="outline" onClick={reuse}><Sparkles data-icon="inline-start" /> Usar a descrição de novo</Button>}
        </div>
      </CardContent>
    </Card>}
  </section>;
}
