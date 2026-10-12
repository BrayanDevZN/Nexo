import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Activity, Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type ApiKey, type ApiKeyUsage, type createApi, type CreatedApiKey, type User } from "./api";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Busy, Feedback, TextField, message } from "./shared";

const PUBLIC_API_URL = "https://nexo-production-60a0.up.railway.app";
const EXAMPLE_ENDPOINT = "/clients";

type Language = "curl" | "javascript" | "python" | "go" | "java" | "php" | "csharp";

const LANGUAGE_LABELS: Record<Language, string> = {
  curl: "cURL",
  javascript: "JavaScript",
  python: "Python",
  go: "Go",
  java: "Java",
  php: "PHP",
  csharp: "C#",
};

const LANGUAGE_COLORS: Record<Language, string> = {
  curl: "#4EAA25",
  javascript: "#F7DF1E",
  python: "#3776AB",
  go: "#00ADD8",
  java: "#ED8B00",
  php: "#777BB4",
  csharp: "#9B4F96",
};

const KEYWORDS: Record<Language, Set<string>> = {
  curl: new Set(["curl"]),
  javascript: new Set(["const", "let", "var", "await", "async", "new", "return", "throw", "if", "else", "true", "false", "null"]),
  python: new Set(["import", "from", "as", "def", "class", "return", "raise", "if", "else", "elif", "for", "while", "in", "True", "False", "None", "with", "async", "await"]),
  go: new Set(["package", "import", "func", "var", "const", "defer", "if", "else", "for", "range", "return", "go", "select", "switch", "case", "nil"]),
  java: new Set(["import", "class", "public", "private", "protected", "static", "final", "new", "var", "return", "throws", "throw", "if", "else", "true", "false", "null"]),
  php: new Set(["echo", "new", "function", "return", "if", "else", "foreach", "as", "true", "false", "null"]),
  csharp: new Set(["using", "var", "new", "await", "async", "return", "if", "else", "true", "false", "null", "public", "private", "class"]),
};

const TYPES = new Set([
  "HttpClient", "HttpRequest", "HttpResponse", "URI", "AuthenticationHeaderValue",
  "MediaTypeWithQualityHeaderValue", "Console", "String", "System", "Header", "DefaultClient",
]);

function codeExamples(apiKey = "SUA_CHAVE_API"): Record<Language, string> {
  const url = `${PUBLIC_API_URL}${EXAMPLE_ENDPOINT}`;
  return {
    curl: `curl -X GET "${url}" \\\n  -H "Authorization: Bearer ${apiKey}" \\\n  -H "Accept: application/json"`,
    javascript: `const response = await fetch("${url}", {
  headers: {
    Authorization: "Bearer ${apiKey}",
    Accept: "application/json",
  },
});

const data = await response.json();
console.log(data);`,
    python: `import requests

response = requests.get(
    "${url}",
    headers={"Authorization": "Bearer ${apiKey}"},
    timeout=30,
)
response.raise_for_status()
print(response.json())`,
    go: `package main

import (
    "fmt"
    "io"
    "net/http"
)

func main() {
    req, _ := http.NewRequest("GET", "${url}", nil)
    req.Header.Set("Authorization", "Bearer ${apiKey}")
    req.Header.Set("Accept", "application/json")

    res, err := http.DefaultClient.Do(req)
    if err != nil { panic(err) }
    defer res.Body.Close()

    body, _ := io.ReadAll(res.Body)
    fmt.Println(string(body))
}`,
    java: `import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

var client = HttpClient.newHttpClient();
var request = HttpRequest.newBuilder()
    .uri(URI.create("${url}"))
    .header("Authorization", "Bearer ${apiKey}")
    .header("Accept", "application/json")
    .GET()
    .build();

var response = client.send(request, HttpResponse.BodyHandlers.ofString());
System.out.println(response.body());`,
    php: `<?php
$ch = curl_init("${url}");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        "Authorization: Bearer ${apiKey}",
        "Accept: application/json",
    ],
]);

$response = curl_exec($ch);
curl_close($ch);
echo $response;`,
    csharp: `using System.Net.Http.Headers;

using var client = new HttpClient();
client.DefaultRequestHeaders.Authorization =
    new AuthenticationHeaderValue("Bearer", "${apiKey}");
client.DefaultRequestHeaders.Accept.Add(
    new MediaTypeWithQualityHeaderValue("application/json"));

var response = await client.GetAsync("${url}");
response.EnsureSuccessStatusCode();
Console.WriteLine(await response.Content.ReadAsStringAsync());`,
  };
}

function highlightCode(code: string, language: Language): ReactNode[] {
  const nodes: ReactNode[] = [];
  const keywords = KEYWORDS[language];
  const token = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b|\s+|.)/g;
  const parts = code.match(token) || [code];

  parts.forEach((part, index) => {
    let color = "#D4D4D4";
    let fontStyle: "normal" | "italic" = "normal";

    if (/^("|'|`)/.test(part)) color = "#CE9178";
    else if (/^(\/\/|\/\*|#(?!\?php))/.test(part)) { color = "#6A9955"; fontStyle = "italic"; }
    else if (/^\d/.test(part)) color = "#B5CEA8";
    else if (keywords.has(part)) color = "#C586C0";
    else if (TYPES.has(part) || /^[A-Z][A-Za-z0-9_]*$/.test(part)) color = "#4EC9B0";
    else if (/^[A-Za-z_$][\w$]*$/.test(part)) {
      const next = parts.slice(index + 1).find(value => !/^\s+$/.test(value));
      if (next === "(") color = "#DCDCAA";
      else if (part.startsWith("$")) color = "#9CDCFE";
      else color = "#9CDCFE";
    }

    nodes.push(<span key={`${index}-${part}`} style={{ color, fontStyle }}>{part}</span>);
  });

  return nodes;
}

export function ApiKeys({ api, user }: { api: ReturnType<typeof createApi>; user: User }) {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [apiKeyName, setApiKeyName] = useState("Minha integração");
  const [createdApiKey, setCreatedApiKey] = useState<CreatedApiKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [language, setLanguage] = useState<Language>("curl");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [usage, setUsage] = useState<ApiKeyUsage[]>([]);
  const [period, setPeriod] = useState<7 | 30 | 90>(30);

  useEffect(() => {
    void api.request<ApiKey[]>("/auth/api-keys").then(setApiKeys).catch(error => setError(message(error)));
  }, [api]);
  useEffect(() => {
    void api.request<ApiKeyUsage[]>(`/auth/api-keys/usage?days=${period}`).then(setUsage).catch(error => setError(message(error)));
  }, [api, period]);

  const chartData = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const item of usage) byDate.set(item.date, (byDate.get(item.date) || 0) + item.count);
    const today = new Date();
    return Array.from({ length: period }, (_, index) => {
      const date = new Date(today); date.setDate(today.getDate() - (period - index - 1));
      const key = date.toISOString().slice(0, 10);
      return { date: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), requests: byDate.get(key) || 0 };
    });
  }, [period, usage]);
  const totalUsage = usage.reduce((sum, item) => sum + item.count, 0);
  const averageUsage = period ? Math.round(totalUsage / period) : 0;
  const chartConfig: ChartConfig = { requests: { label: "Requisições", color: "var(--primary)" } };
  const examples = useMemo(() => codeExamples(), []);
  const highlightedExample = useMemo(() => highlightCode(examples[language], language), [examples, language]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !apiKeyName.trim()) return;
    setBusy(true); setError(""); setSuccess(""); setCreatedApiKey(null); setCopied(false);
    try {
      const created = await api.mutate<CreatedApiKey>("/auth/api-keys", "POST", { name: apiKeyName.trim() });
      setCreatedApiKey(created); setApiKeys(keys => [created, ...keys]);
      setSuccess("Chave criada. Copie-a agora, pois ela não será exibida novamente.");
    } catch (error) { setError(message(error)); } finally { setBusy(false); }
  }

  async function revoke(id: string) {
    if (busy) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await api.mutate("/auth/api-keys/" + id, "DELETE");
      setApiKeys(keys => keys.filter(key => key.id !== id)); setSuccess("Chave revogada.");
    } catch (error) { setError(message(error)); } finally { setBusy(false); }
  }

  async function copy() {
    if (!createdApiKey) return;
    await navigator.clipboard.writeText(createdApiKey.key);
    setCopied(true);
  }

  async function copyValue(value: string, snippet = false) {
    await navigator.clipboard.writeText(value);
    if (snippet) {
      setCopiedSnippet(true);
      window.setTimeout(() => setCopiedSnippet(false), 1800);
    }
  }

  if (user.status !== "approved") return null;
  return <section className="flex flex-col gap-6" aria-labelledby="api-title">
    <div className="admin-section-head"><div><span className="admin-eyebrow">INTEGRAÇÕES</span><h1 id="api-title">API</h1><p>Crie credenciais, integre seus sistemas e acompanhe o uso da API.</p></div></div>
    <Feedback error={error} success={success} />

    <Card className="border-primary/30 shadow-sm">
      <CardHeader>
        <div className="mb-1 w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">DOCUMENTAÇÃO RÁPIDA</div>
        <CardTitle>Tutorial: como usar a API da Nexo</CardTitle>
        <CardDescription>Use a URL base abaixo, crie uma chave e envie essa chave no header Authorization. Os exemplos já estão prontos para copiar.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border p-4"><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">1. URL base</p><div className="flex items-center gap-2"><code className="min-w-0 flex-1 overflow-x-auto text-sm">{PUBLIC_API_URL}</code><Button type="button" size="icon" variant="ghost" aria-label="Copiar URL da API" onClick={() => void copyValue(PUBLIC_API_URL)}><Copy /></Button></div></div>
          <div className="rounded-xl border p-4"><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">2. Autenticação</p><code className="block overflow-x-auto text-sm">Authorization: Bearer SUA_CHAVE_API</code></div>
          <div className="rounded-xl border p-4"><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">3. Exemplo de endpoint</p><code className="block overflow-x-auto text-sm">GET {EXAMPLE_ENDPOINT}</code></div>
        </div>

        <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
          <p><strong className="text-foreground">Passo a passo:</strong> crie uma chave em “Acesso por API”, copie e salve em uma variável de ambiente no seu sistema. Depois faça a requisição para <code>{PUBLIC_API_URL}{EXAMPLE_ENDPOINT}</code> enviando <code>Authorization: Bearer SUA_CHAVE_API</code>. Nunca coloque a chave no frontend público, em URL, query string ou Git.</p>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">Escolha sua linguagem:</p>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Exemplos por linguagem">
            {(Object.keys(LANGUAGE_LABELS) as Language[]).map(item => <Button key={item} type="button" size="sm" variant={language === item ? "secondary" : "outline"} onClick={() => { setLanguage(item); setCopiedSnippet(false); }}><span className="size-2 rounded-full" style={{ backgroundColor: LANGUAGE_COLORS[item] }} />{LANGUAGE_LABELS[item]}</Button>)}
          </div>
          <div className="relative overflow-hidden rounded-xl border border-[#3c3c3c] bg-[#1e1e1e] text-[#d4d4d4] shadow-inner">
            <div className="flex items-center justify-between border-b border-[#3c3c3c] bg-[#252526] px-4 py-2"><span className="flex items-center gap-2 text-xs font-medium text-[#cccccc]"><span className="size-2 rounded-full" style={{ backgroundColor: LANGUAGE_COLORS[language] }} />{LANGUAGE_LABELS[language]}</span><Button type="button" size="sm" variant="ghost" className="text-[#cccccc] hover:bg-white/10 hover:text-white" onClick={() => void copyValue(examples[language], true)}>{copiedSnippet ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}{copiedSnippet ? "Copiado" : "Copiar"}</Button></div>
            <pre className="overflow-x-auto p-4 font-mono text-xs leading-6"><code>{highlightedExample}</code></pre>
          </div>
          <p className="text-xs text-muted-foreground">O exemplo usa <code>GET {EXAMPLE_ENDPOINT}</code>. Para outros recursos, mantenha a mesma URL base e autenticação e troque apenas o método, endpoint e corpo da requisição.</p>
        </div>
      </CardContent>
    </Card>

    <div className="grid gap-4 md:grid-cols-3"><Card><CardHeader className="pb-2"><CardDescription>Requisições no período</CardDescription><CardTitle className="text-3xl">{totalUsage.toLocaleString("pt-BR")}</CardTitle></CardHeader><CardContent><p className="text-xs text-muted-foreground">Últimos {period} dias</p></CardContent></Card><Card><CardHeader className="pb-2"><CardDescription>Média diária</CardDescription><CardTitle className="text-3xl">{averageUsage.toLocaleString("pt-BR")}</CardTitle></CardHeader><CardContent><p className="text-xs text-muted-foreground">Requisições por dia</p></CardContent></Card><Card><CardHeader className="pb-2"><CardDescription>Chaves ativas</CardDescription><CardTitle className="text-3xl">{apiKeys.length}</CardTitle></CardHeader><CardContent><p className="text-xs text-muted-foreground">Credenciais disponíveis</p></CardContent></Card></div>
    <Card><CardHeader className="flex flex-row items-center justify-between gap-4"><div><CardTitle className="flex items-center gap-2"><Activity className="size-5" />Uso da API</CardTitle><CardDescription>Quantidade de requisições autenticadas por período.</CardDescription></div><div className="flex gap-1" role="group" aria-label="Período do gráfico">{([7, 30, 90] as const).map(value => <Button key={value} variant={period === value ? "secondary" : "outline"} size="sm" onClick={() => setPeriod(value)}>{value}d</Button>)}</div></CardHeader><CardContent><ChartContainer config={chartConfig} className="h-72" aria-label="Gráfico de uso da API"><LineChart data={chartData} margin={{ left: 8, right: 12, top: 8, bottom: 8 }}><CartesianGrid vertical={false} /><XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={24} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} /><ChartTooltip content={<ChartTooltipContent formatter={(value) => `${value} requisições`} />} /><Line type="monotone" dataKey="requests" stroke="var(--color-requests)" strokeWidth={2} dot={false} /></LineChart></ChartContainer></CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="size-5" /> Acesso por API</CardTitle><CardDescription>Use uma chave no header <code>Authorization: Bearer SUA_CHAVE</code> para consumir os recursos permitidos sem cookie. A chave completa aparece somente uma vez.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Button className="w-fit" onClick={() => { setCreatedApiKey(null); setCopied(false); setCreateOpen(true); }}><KeyRound data-icon="inline-start" /> Criar nova chave</Button>
        {apiKeys.length > 0 ? <div className="flex flex-col gap-2">{apiKeys.map(key => <div key={key.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><p className="font-medium">{key.name}</p><p className="text-xs text-muted-foreground"><code>{key.key_prefix}••••••••</code> · criada em {new Date(key.created_at).toLocaleDateString("pt-BR")}{key.last_used_at ? " · usada por último em " + new Date(key.last_used_at).toLocaleDateString("pt-BR") : " · ainda não usada"}</p></div><Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => void revoke(key.id)}><Trash2 data-icon="inline-start" /> Revogar</Button></div>)}</div> : <p className="text-sm text-muted-foreground">Nenhuma chave ativa.</p>}
      </CardContent>
    </Card>
    <Dialog open={createOpen} onOpenChange={open => { if (!busy) { setCreateOpen(open); if (!open) { setCreatedApiKey(null); setCopied(false); } } }}>
      <DialogContent className="max-w-lg">
        {!createdApiKey ? <>
          <DialogHeader><DialogTitle>Criar nova chave de API</DialogTitle><DialogDescription>Dê um nome para identificar onde essa chave será usada. A chave será exibida uma única vez após a criação.</DialogDescription></DialogHeader>
          <form onSubmit={create} className="flex flex-col gap-5"><TextField label="Nome da chave" value={apiKeyName} onChange={event => setApiKeyName(event.target.value)} maxLength={80} placeholder="Ex.: Integração com CRM" required /><DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setCreateOpen(false)}>Cancelar</Button><Button type="submit" disabled={busy || !apiKeyName.trim()}>{busy ? <Busy>Gerando…</Busy> : <><KeyRound data-icon="inline-start" /> Gerar chave</>}</Button></DialogFooter></form>
        </> : <>
          <DialogHeader><DialogTitle>Chave criada com sucesso</DialogTitle><DialogDescription>Copie esta chave agora e armazene-a em um local seguro. Por segurança, ela não será mostrada novamente.</DialogDescription></DialogHeader>
          <div className="flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-50 p-4 dark:bg-amber-950/20"><p className="text-sm font-medium">{createdApiKey.name}</p><div className="flex items-center gap-2"><code className="min-w-0 flex-1 overflow-x-auto rounded bg-background px-3 py-3 text-xs">{createdApiKey.key}</code><Button type="button" variant="outline" size="icon" onClick={() => void copy()} aria-label="Copiar chave API">{copied ? <Check /> : <Copy />}</Button></div></div>
          <DialogFooter><Button type="button" onClick={() => { setCreateOpen(false); setCreatedApiKey(null); setCopied(false); }}>Concluir</Button></DialogFooter>
        </>}
      </DialogContent>
    </Dialog>
  </section>;
}
