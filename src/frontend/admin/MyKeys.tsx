import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, Copy, KeyRound, MapPin, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { type ApiKey, type ApiKeyUsage, type CreatedApiKey, type createApi } from "./api";
import { Busy, Feedback, Loading, TextField, message } from "./shared";

type MapsStatus = { configured: boolean; source: "panel" | "environment" | null; key_prefix: string | null; own?: boolean };
const chartConfig = { requests: { label: "Usos", color: "var(--primary)" } };
const dateLabel = (value: string | null) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("pt-BR") : "—";
};

/** The member's own API keys, used in Maps. Deliberately without code samples. */
export function MyKeys({ api, onOpenMaps }: { api: ReturnType<typeof createApi>; onOpenMaps: () => void }) {
  const [keys, setKeys] = useState<ApiKey[]>();
  const [usage, setUsage] = useState<ApiKeyUsage[]>([]);
  const [maps, setMaps] = useState<MapsStatus>();
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const [name, setName] = useState("Minha chave do Maps");
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    try {
      const [list, used, status] = await Promise.all([
        api.request<ApiKey[]>("/auth/api-keys"),
        api.request<ApiKeyUsage[]>(`/auth/api-keys/usage?days=${period}`),
        api.request<MapsStatus>("/maps/status").catch(() => undefined),
      ]);
      setKeys(list); setUsage(used); setMaps(status); setError("");
    } catch (e) { setError(message(e)); setKeys(current => current ?? []); }
  }, [api, period]);
  useEffect(() => { void load(); }, [load]);

  const chart = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const item of usage) byDate.set(item.date, (byDate.get(item.date) ?? 0) + item.count);
    const today = new Date();
    return Array.from({ length: period }, (_, index) => {
      const date = new Date(today); date.setDate(today.getDate() - (period - index - 1));
      return { date: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), requests: byDate.get(date.toISOString().slice(0, 10)) ?? 0 };
    });
  }, [usage, period]);
  const total = usage.reduce((sum, item) => sum + item.count, 0);
  const perKey = useMemo(() => {
    const totals = new Map<string, number>();
    for (const item of usage) totals.set(item.api_key_id, (totals.get(item.api_key_id) ?? 0) + item.count);
    return totals;
  }, [usage]);
  const lastUse = [...(keys ?? [])].map(key => key.last_used_at).filter((value): value is string => !!value).sort().pop() ?? null;

  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true); setError(""); setSuccess(""); setCopied(false);
    try {
      const key = await api.mutate<CreatedApiKey>("/auth/api-keys", "POST", { name: name.trim() });
      setCreated(key); setKeys(current => [key, ...(current ?? [])]);
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  async function useInMaps() {
    if (!created || busy) return;
    setBusy(true); setError("");
    try {
      setMaps(await api.mutate<MapsStatus>("/maps/key", "PUT", { api_key: created.key }));
      setCreated(null); setSuccess("Pronto! Essa chave agora é a que o Maps usa para você.");
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  async function copy() {
    if (!created) return;
    try { await navigator.clipboard.writeText(created.key); setCopied(true); } catch { setError("Não foi possível copiar. Selecione a chave e copie manualmente."); }
  }
  async function revoke() {
    if (!revoking || busy) return;
    setBusy(true); setError("");
    try {
      await api.mutate("/auth/api-keys/" + revoking.id, "DELETE");
      setKeys(current => (current ?? []).filter(key => key.id !== revoking.id));
      setRevoking(null); setSuccess("Chave revogada. Ela deixa de funcionar na hora.");
      await load();
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }

  if (!keys) return <Loading />;
  return <section className="flex flex-col gap-6" aria-labelledby="my-keys-title">
    <div className="admin-section-head"><div><span className="admin-eyebrow">COMERCIAL</span><h1 id="my-keys-title">Chaves</h1>
      <p>Suas chaves pessoais para usar o Maps. Elas só funcionam no Maps e nos clientes.</p></div>
      <Button variant="outline" onClick={() => void load()}><RefreshCw data-icon="inline-start" /> Atualizar</Button></div>
    <Feedback error={error} success={success} />

    <Card>
      <CardHeader><CardTitle className="flex flex-wrap items-center gap-2"><MapPin className="size-4" /> Chave em uso no Maps
        <Badge variant={maps?.configured ? "default" : "destructive"}>{maps?.configured ? "Configurada" : "Não configurada"}</Badge></CardTitle>
        <CardDescription>{maps?.configured
          ? `${maps.own ? "Sua chave" : "Chave compartilhada"} ${maps.key_prefix ?? ""}… está em uso no Maps.`
          : "Crie uma chave abaixo e use no Maps para começar a buscar empresas."}</CardDescription></CardHeader>
      <CardContent><Button variant="outline" onClick={onOpenMaps}><MapPin data-icon="inline-start" /> Abrir o Maps</Button></CardContent>
    </Card>

    <div className="grid gap-4 sm:grid-cols-3">
      <Card><CardHeader><CardDescription>Minhas chaves</CardDescription><CardTitle className="text-3xl">{keys.length}</CardTitle></CardHeader></Card>
      <Card><CardHeader><CardDescription>Usos em {period} dias</CardDescription><CardTitle className="text-3xl">{total.toLocaleString("pt-BR")}</CardTitle></CardHeader></Card>
      <Card><CardHeader><CardDescription>Último uso</CardDescription><CardTitle className="text-2xl">{dateLabel(lastUse)}</CardTitle></CardHeader></Card>
    </div>

    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3"><div><CardTitle>Uso das chaves</CardTitle><CardDescription>Quantas vezes as suas chaves foram usadas por dia.</CardDescription></div>
        <div className="w-36"><NativeSelect aria-label="Período" value={String(period)} onChange={event => setPeriod(Number(event.target.value) as 7 | 30 | 90)}>
          <NativeSelectOption value="7">7 dias</NativeSelectOption><NativeSelectOption value="30">30 dias</NativeSelectOption><NativeSelectOption value="90">90 dias</NativeSelectOption></NativeSelect></div></CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[16rem]" aria-label="Gráfico de área com o uso das chaves por dia">
          <AreaChart data={chart} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="4 4" />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={10} minTickGap={24} />
            <YAxis allowDecimals={false} domain={[0, "auto"]} tickLine={false} axisLine={false} width={40} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent formatter={value => String(value)} />} />
            <Area type="linear" dataKey="requests" name="Usos" stroke="var(--color-requests)" strokeWidth={2.5} fill="var(--color-requests)" fillOpacity={0.25} dot={period <= 30 ? { r: 3 } : false} activeDot={{ r: 6 }} isAnimationActive={false} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>Criar chave</CardTitle><CardDescription>Dê um nome para lembrar onde ela é usada. A chave aparece uma única vez, logo depois de criada.</CardDescription></CardHeader>
      <CardContent><form onSubmit={event => void create(event)} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1"><TextField label="Nome da chave" value={name} maxLength={80} onChange={event => setName(event.target.value)} /></div>
        <Button type="submit" disabled={busy || !name.trim()}>{busy && !created ? <Busy>Criando…</Busy> : <><Plus data-icon="inline-start" /> Criar chave</>}</Button>
      </form></CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>Suas chaves</CardTitle><CardDescription>Revogue uma chave se ela for exposta ou não for mais usada.</CardDescription></CardHeader>
      <CardContent>{keys.length === 0 ? <Empty><EmptyHeader><EmptyMedia variant="icon"><KeyRound /></EmptyMedia><EmptyTitle>Nenhuma chave ainda</EmptyTitle>
        <EmptyDescription>Crie a sua primeira chave para usar no Maps.</EmptyDescription></EmptyHeader></Empty>
        : <ul className="flex flex-col gap-3">{keys.map(key => <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
          <div className="min-w-0"><p className="truncate text-sm font-medium">{key.name}</p><p className="font-mono text-xs text-muted-foreground">{key.key_prefix}…</p></div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>Criada em {dateLabel(key.created_at)}</span><span>{key.last_used_at ? `Usada em ${dateLabel(key.last_used_at)}` : "Nunca usada"}</span>
            <Badge variant="secondary">{perKey.get(key.id) ?? 0} uso(s) em {period} dias</Badge>
            <Button variant="ghost" size="icon" onClick={() => setRevoking(key)} aria-label={`Revogar ${key.name}`}><Trash2 /></Button></div></li>)}</ul>}</CardContent>
    </Card>

    <Dialog open={created !== null} onOpenChange={open => { if (!open && !busy) setCreated(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Chave criada</DialogTitle><DialogDescription>Copie agora: por segurança, ela não será mostrada de novo.</DialogDescription></DialogHeader>
        <code className="block break-all rounded-md border bg-muted/40 p-3 text-sm" data-testid="new-key">{created?.key}</code>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={() => void copy()}>{copied ? <><Check data-icon="inline-start" /> Copiada</> : <><Copy data-icon="inline-start" /> Copiar</>}</Button>
          <Button disabled={busy} onClick={() => void useInMaps()}>{busy ? <Busy>Salvando…</Busy> : <><MapPin data-icon="inline-start" /> Usar no Maps</>}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={revoking !== null} onOpenChange={open => { if (!open && !busy) setRevoking(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Revogar esta chave?</DialogTitle><DialogDescription>{revoking?.name} deixa de funcionar imediatamente. Se o Maps usa essa chave, crie outra e use no Maps.</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setRevoking(null)}>Cancelar</Button>
          <Button variant="destructive" disabled={busy} onClick={() => void revoke()}>{busy ? <Busy>Revogando…</Busy> : "Revogar"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
