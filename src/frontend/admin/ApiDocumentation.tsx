import { useMemo, useState } from "react";
import { ArrowLeft, BellRing, BookOpen, Check, Copy, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

const BASE_URL = "https://nexo-production-60a0.up.railway.app";

type Method = "GET" | "POST" | "PATCH" | "DELETE";
type Language = "curl" | "javascript" | "python" | "go" | "java" | "php" | "csharp";

type Endpoint = {
  method: Method;
  route: string;
  path: string;
  title: string;
  description: string;
  query?: string[];
  headers?: Record<string, string>;
  body?: string;
  response: string;
  notifies?: boolean;
  multipart?: boolean;
};

const ENDPOINTS: Endpoint[] = [
  {
    method: "GET",
    route: "/dashboard",
    path: "/dashboard",
    title: "Resumo do negócio",
    description: "Retorna os indicadores agregados usados no dashboard administrativo.",
    response: `{
  "clients": 42,
  "won_contracts": 8,
  "revenue": 18500,
  "pipeline": { "lead": 12, "proposal": 4, "won": 8 }
}`,
  },
  {
    method: "GET",
    route: "/clients",
    path: "/clients",
    title: "Listar clientes",
    description: "Lista clientes com paginação e filtros opcionais.",
    query: ["niche", "name", "created_by_id", "pipeline_stage", "contract_closed", "limit", "offset"],
    response: `[
  {
    "id": "uuid-do-cliente",
    "name": "Empresa Exemplo",
    "niche": "Contabilidade",
    "pipeline_stage": "lead",
    "contract_closed": false
  }
]`,
  },
  {
    method: "GET",
    route: "/clients",
    path: "/clients/{identifier}",
    title: "Buscar cliente",
    description: "Retorna um cliente específico pelo identificador.",
    response: `{
  "id": "uuid-do-cliente",
  "name": "Empresa Exemplo",
  "niche": "Contabilidade",
  "pipeline_stage": "lead"
}`,
  },
  {
    method: "POST",
    route: "/clients",
    path: "/clients",
    title: "Criar cliente",
    description: "Cria um cliente e registra a alteração no painel.",
    body: `{
  "name": "Empresa Exemplo",
  "niche": "Contabilidade",
  "phone": "31999999999",
  "email": "contato@empresa.com",
  "pipeline_stage": "lead",
  "contract_closed": false,
  "contract_value": 1500,
  "notes": "Lead vindo pela API"
}`,
    response: `{
  "id": "uuid-do-cliente",
  "name": "Empresa Exemplo",
  "niche": "Contabilidade",
  "pipeline_stage": "lead",
  "contract_closed": false,
  "contract_value": 1500
}`,
    notifies: true,
  },
  {
    method: "PATCH",
    route: "/clients",
    path: "/clients/{identifier}",
    title: "Atualizar cliente",
    description: "Atualiza somente os campos enviados no corpo da requisição.",
    body: `{
  "pipeline_stage": "won",
  "contract_closed": true,
  "contract_value": 2500
}`,
    response: `{
  "id": "uuid-do-cliente",
  "pipeline_stage": "won",
  "contract_closed": true,
  "contract_value": 2500
}`,
    notifies: true,
  },
  {
    method: "DELETE",
    route: "/clients",
    path: "/clients/{identifier}",
    title: "Excluir cliente",
    description: "Remove o cliente informado pelo identificador.",
    response: "HTTP 204 No Content",
    notifies: true,
  },
  {
    method: "GET",
    route: "/documents",
    path: "/documents",
    title: "Listar documentos",
    description: "Lista documentos enviados para o painel.",
    query: ["client_id", "limit", "offset"],
    response: `[
  {
    "id": "uuid-do-documento",
    "filename": "contrato.pdf",
    "size": 248112,
    "client_id": "uuid-do-cliente"
  }
]`,
  },
  {
    method: "POST",
    route: "/documents",
    path: "/documents",
    title: "Enviar documento",
    description: "Envia um arquivo usando multipart/form-data.",
    query: ["client_id"],
    body: `file=@contrato.pdf`,
    response: `{
  "id": "uuid-do-documento",
  "filename": "contrato.pdf",
  "size": 248112,
  "client_id": "uuid-do-cliente"
}`,
    multipart: true,
  },
  {
    method: "GET",
    route: "/documents",
    path: "/documents/{identifier}/download",
    title: "Baixar documento",
    description: "Baixa o conteúdo binário do documento.",
    response: "application/octet-stream",
  },
  {
    method: "DELETE",
    route: "/documents",
    path: "/documents/{identifier}",
    title: "Excluir documento",
    description: "Remove o documento informado pelo identificador.",
    response: "HTTP 204 No Content",
  },
];

const ROUTES = ["/dashboard", "/clients", "/documents"] as const;

const METHOD_STYLE: Record<Method, string> = {
  GET: "border-sky-500/30 bg-sky-500/10 text-sky-600",
  POST: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  PATCH: "border-amber-500/30 bg-amber-500/10 text-amber-600",
  DELETE: "border-rose-500/30 bg-rose-500/10 text-rose-600",
};

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

function headersFor(endpoint: Endpoint) {
  return {
    Authorization: "Bearer SUA_CHAVE_API",
    Accept: "application/json",
    ...(endpoint.method !== "GET" && endpoint.method !== "DELETE"
      ? { "Content-Type": endpoint.multipart ? "multipart/form-data" : "application/json" }
      : {}),
    ...endpoint.headers,
  };
}

function requestExample(endpoint: Endpoint, language: Language): string {
  const url = `${BASE_URL}${endpoint.path.replace("{identifier}", "SEU_ID")}`;
  const headers = headersFor(endpoint);
  const body = endpoint.body;

  if (language === "curl") {
    const lines = [`curl -X ${endpoint.method} "${url}"`];
    for (const [key, value] of Object.entries(headers)) lines.push(`  -H "${key}: ${value}"`);
    if (body) lines.push(endpoint.multipart ? `  -F "${body}"` : `  -d '${body.replace(/\n/g, " ")}'`);
    return lines.join(" \\\n");
  }

  if (language === "javascript") {
    return `const response = await fetch("${url}", {
  method: "${endpoint.method}",
  headers: ${JSON.stringify(headers, null, 4).replace(/^/gm, "  ").trim()},${body && !endpoint.multipart ? `
  body: JSON.stringify(${body}),` : ""}
});

${endpoint.method === "DELETE" ? "console.log(response.status);" : "const data = await response.json();\nconsole.log(data);"}`;
  }

  if (language === "python") {
    const requestMethod = endpoint.method.toLowerCase();
    return `import requests

response = requests.${requestMethod}(
    "${url}",
    headers=${JSON.stringify(headers, null, 4).replace(/"/g, "'")},${body && !endpoint.multipart ? `
    json=${body.replace(/true/g, "True").replace(/false/g, "False").replace(/null/g, "None")},` : ""}
    timeout=30,
)
response.raise_for_status()
${endpoint.method === "DELETE" ? "print(response.status_code)" : "print(response.json())"}`;
  }

  if (language === "go") {
    return `package main

import (
  "fmt"
  "net/http"${body && !endpoint.multipart ? "\n  \"strings\"" : ""}
)

func main() {
  ${body && !endpoint.multipart ? `body := strings.NewReader(\`${body}\`)\n  ` : ""}req, _ := http.NewRequest("${endpoint.method}", "${url}", ${body && !endpoint.multipart ? "body" : "nil"})
${Object.entries(headers).map(([key, value]) => `  req.Header.Set("${key}", "${value}")`).join("\n")}
  res, err := http.DefaultClient.Do(req)
  if err != nil { panic(err) }
  defer res.Body.Close()
  fmt.Println(res.StatusCode)
}`;
  }

  if (language === "java") {
    return `var request = HttpRequest.newBuilder()
    .uri(URI.create("${url}"))
${Object.entries(headers).map(([key, value]) => `    .header("${key}", "${value}")`).join("\n")}
    .method("${endpoint.method}", ${body && !endpoint.multipart ? `HttpRequest.BodyPublishers.ofString(${JSON.stringify(body)})` : "HttpRequest.BodyPublishers.noBody()"})
    .build();

var response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
System.out.println(response.body());`;
  }

  if (language === "php") {
    return `<?php
$ch = curl_init("${url}");
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "${endpoint.method}");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
${Object.entries(headers).map(([key, value]) => `    "${key}: ${value}",`).join("\n")}
]);${body && !endpoint.multipart ? `
curl_setopt($ch, CURLOPT_POSTFIELDS, ${JSON.stringify(body)});` : ""}
$response = curl_exec($ch);
curl_close($ch);
echo $response;`;
  }

  return `using System.Net.Http.Headers;
using System.Text;

using var client = new HttpClient();
using var request = new HttpRequestMessage(HttpMethod.${endpoint.method === "PATCH" ? "Patch" : endpoint.method === "DELETE" ? "Delete" : endpoint.method === "POST" ? "Post" : "Get"}, "${url}");
request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "SUA_CHAVE_API");${body && !endpoint.multipart ? `
request.Content = new StringContent(${JSON.stringify(body)}, Encoding.UTF8, "application/json");` : ""}
var response = await client.SendAsync(request);
Console.WriteLine(await response.Content.ReadAsStringAsync());`;
}

function CodeBlock({ title, value, onCopy, copied }: { title: string; value: string; onCopy: () => void; copied: boolean }) {
  return <div className="overflow-hidden rounded-xl border border-[#3c3c3c] bg-[#1e1e1e]">
    <div className="flex items-center justify-between border-b border-[#3c3c3c] bg-[#252526] px-4 py-2">
      <span className="text-xs font-medium text-[#cccccc]">{title}</span>
      <Button type="button" size="sm" variant="ghost" className="text-[#cccccc] hover:bg-white/10 hover:text-white" onClick={onCopy}>
        {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}{copied ? "Copiado" : "Copiar"}
      </Button>
    </div>
    <pre className="max-h-72 overflow-auto p-4 font-mono text-xs leading-6 text-[#d4d4d4]"><code>{value}</code></pre>
  </div>;
}

export function ApiDocumentation() {
  const [route, setRoute] = useState<(typeof ROUTES)[number]>("/clients");
  const [selected, setSelected] = useState<Endpoint | null>(null);
  const [language, setLanguage] = useState<Language>("curl");
  const [copied, setCopied] = useState<string>("");

  const methods = useMemo(() => ENDPOINTS.filter(endpoint => endpoint.route === route), [route]);
  const fullExample = selected ? requestExample(selected, language) : "";

  function copy(label: string, value: string) {
    void navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(current => current === label ? "" : current), 1600);
  }

  function openMethod(endpoint: Endpoint) {
    setSelected(endpoint);
    setCopied("");
  }

  return <Dialog onOpenChange={open => { if (!open) setSelected(null); }}>
    <DialogTrigger asChild>
      <Button variant="outline" className="gap-2"><BookOpen className="size-4" />Ver documentação</Button>
    </DialogTrigger>
    <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto p-0">
      {!selected ? <>
        <DialogHeader className="border-b px-6 pb-5 pt-6">
          <DialogTitle>Documentação da API</DialogTitle>
          <DialogDescription>Escolha um path e abra um método para ver requisição, headers, body e resposta.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex min-w-[15rem] flex-col gap-2">
              <label htmlFor="api-doc-route" className="text-sm font-medium">Path</label>
              <NativeSelect id="api-doc-route" value={route} onChange={event => setRoute(event.target.value as typeof route)}>
                {ROUTES.map(item => <NativeSelectOption key={item} value={item}>{item}</NativeSelectOption>)}
              </NativeSelect>
            </div>
            <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Base:</span> <code>{BASE_URL}</code>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Métodos disponíveis</p><h3 className="mt-1 font-semibold">{route}</h3></div>
              <Badge variant="secondary">{methods.length} {methods.length === 1 ? "método" : "métodos"}</Badge>
            </div>

            <div className="grid gap-3">
              {methods.map(endpoint => <Card key={`${endpoint.method}-${endpoint.path}`} className="shadow-none transition-colors hover:border-primary/40">
                <CardHeader className="flex flex-row items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={METHOD_STYLE[endpoint.method]}>{endpoint.method}</Badge>
                      <code className="break-all text-sm font-semibold">{endpoint.path}</code>
                      {endpoint.notifies && <Badge variant="secondary" className="gap-1"><BellRing className="size-3" /> notifica</Badge>}
                    </div>
                    <CardTitle className="text-base">{endpoint.title}</CardTitle>
                    <CardDescription className="mt-1">{endpoint.description}</CardDescription>
                  </div>
                  <Button type="button" size="sm" onClick={() => openMethod(endpoint)}>Ver <ExternalLink data-icon="inline-end" /></Button>
                </CardHeader>
              </Card>)}
            </div>
          </div>
        </div>
      </> : <>
        <DialogHeader className="border-b px-6 pb-5 pt-6">
          <div className="flex items-start gap-3 pr-8">
            <Button type="button" variant="ghost" size="icon-sm" className="mt-0.5 shrink-0" onClick={() => setSelected(null)} aria-label="Voltar para os métodos"><ArrowLeft /></Button>
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2"><Badge variant="outline" className={METHOD_STYLE[selected.method]}>{selected.method}</Badge><code className="break-all text-sm font-semibold">{selected.path}</code>{selected.notifies && <Badge variant="secondary"><BellRing data-icon="inline-start" /> envia notificação</Badge>}</div>
              <DialogTitle>{selected.title}</DialogTitle>
              <DialogDescription>{selected.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-6 p-6">
          {selected.query?.length ? <div className="rounded-xl border bg-muted/20 p-4"><p className="mb-2 text-sm font-medium">Query params</p><div className="flex flex-wrap gap-2">{selected.query.map(item => <Badge key={item} variant="outline"><code>{item}</code></Badge>)}</div></div> : null}

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium">Exemplo completo</p><p className="text-xs text-muted-foreground">Troque os valores de exemplo pelos dados da sua integração.</p></div></div>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Linguagem do exemplo">
              {(Object.keys(LANGUAGE_LABELS) as Language[]).map(item => <Button key={item} type="button" size="sm" variant={language === item ? "secondary" : "outline"} onClick={() => { setLanguage(item); setCopied(""); }}><span className="size-2 rounded-full" style={{ backgroundColor: LANGUAGE_COLORS[item] }} />{LANGUAGE_LABELS[item]}</Button>)}
            </div>
            <CodeBlock title={LANGUAGE_LABELS[language]} value={fullExample} copied={copied === "example"} onCopy={() => copy("example", fullExample)} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Headers</p>
              <CodeBlock title="Headers da requisição" value={Object.entries(headersFor(selected)).map(([key, value]) => `${key}: ${value}`).join("\n")} copied={copied === "headers"} onCopy={() => copy("headers", Object.entries(headersFor(selected)).map(([key, value]) => `${key}: ${value}`).join("\n"))} />
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Body</p>
              <CodeBlock title={selected.multipart ? "multipart/form-data" : "application/json"} value={selected.body || "Este método não envia corpo na requisição."} copied={copied === "body"} onCopy={() => copy("body", selected.body || "")} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Resposta de exemplo</p>
            <CodeBlock title="Resposta" value={selected.response} copied={copied === "response"} onCopy={() => copy("response", selected.response)} />
          </div>
        </div>
      </>}
    </DialogContent>
  </Dialog>;
}
