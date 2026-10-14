import { useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, BellRing, BookOpen, Check, Copy, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

const BASE_URL = "https://nexo-production-60a0.up.railway.app";

type Method = "GET" | "POST" | "PATCH" | "DELETE";
type Language = "curl" | "javascript" | "python" | "go" | "java" | "php" | "csharp";
type Route = "/dashboard" | "/clients" | "/documents" | "/automations" | "/notifications" | "/admin/announcements";

type Endpoint = {
  method: Method;
  route: Route;
  path: string;
  title: string;
  description: string;
  query?: string[];
  headers?: Record<string, string>;
  body?: string;
  response: string;
  notifies?: boolean;
  multipart?: boolean;
  adminOnly?: boolean;
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
    method: "GET",
    route: "/automations",
    path: "/automations/{identifier}",
    title: "Obter automação",
    description: "Retorna os metadados de uma automação pelo ID, sem carregar o arquivo binário.",
    response: `{
  "id": "uuid-da-automacao",
  "name": "Captura de leads",
  "description": "Importa e organiza novos contatos.",
  "filename": "captura-leads.json",
  "file_size": 24512,
  "created_by_name": "Brayan",
  "has_image": false
}`,
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
    route: "/automations",
    path: "/automations",
    title: "Listar automações compartilhadas",
    description: "Lista automações salvas na biblioteca. Qualquer membro aprovado pode consultar.",
    query: ["limit", "offset"],
    response: `[
  {
    "id": "uuid-da-automacao",
    "name": "Captura de leads",
    "description": "Importa e organiza novos contatos.",
    "filename": "captura-leads.json",
    "file_size": 24512,
    "created_by_name": "Brayan",
    "has_image": false
  }
]`,
  },
  {
    method: "POST",
    route: "/automations",
    path: "/automations",
    title: "Salvar automação",
    description: "Envia nome, descrição e arquivo em multipart/form-data; foto é opcional. A criação gera um aviso para todos os membros aprovados.",
    body: "name=Captura de leads\ndescription=Importa e organiza novos contatos.\nfile=@captura-leads.json\nimage=@capa.png (opcional)",
    response: `{
  "id": "uuid-da-automacao",
  "name": "Captura de leads",
  "filename": "captura-leads.json",
  "file_size": 24512,
  "has_image": true
}`,
    multipart: true,
    notifies: true,
  },
  {
    method: "PATCH",
    route: "/automations",
    path: "/automations/{identifier}",
    title: "Atualizar automação",
    description: "Atualiza nome, descrição, arquivo JSON e/ou imagem via multipart/form-data. Campos omitidos permanecem iguais. Permitido a dev, admin ou owner; a alteração gera um aviso para os membros aprovados.",
    body: "name=ChatBot Interno Nexo\ndescription=Chatbot interno com suporte a texto, áudio e imagem.\nfile=@chatbot-nexo-interno.json (opcional)\nimage=@chatbot-nexo-capa.jpg (opcional)",
    response: `{
  "id": "uuid-da-automacao",
  "name": "ChatBot Interno Nexo",
  "filename": "chatbot-nexo-interno.json",
  "has_image": true,
  "can_manage": true
}`,
    multipart: true,
    notifies: true,
  },
  {
    method: "DELETE",
    route: "/automations",
    path: "/automations/{identifier}",
    title: "Excluir automação",
    description: "Remove a automação da biblioteca. Permitido a dev, admin ou owner; todos os membros aprovados recebem um aviso, incluindo a imagem cadastrada.",
    response: `{
  "id": "uuid-da-automacao",
  "deleted": true
}`,
    notifies: true,
  },
  {
    method: "GET",
    route: "/automations",
    path: "/automations/{identifier}/download",
    title: "Baixar automação",
    description: "Baixa o arquivo binário da automação. Exige sessão aprovada ou chave API de dev, admin ou owner.",
    response: "application/octet-stream",
  },
  {
    method: "GET",
    route: "/automations",
    path: "/automations/{identifier}/image",
    title: "Ver imagem da automação",
    description: "Retorna a foto opcional da automação como JPEG.",
    response: "image/jpeg",
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
    body: "file=@contrato.pdf",
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
    path: "/documents/{identifier}",
    title: "Obter documento",
    description: "Retorna os metadados do documento pelo ID, sem incluir o conteúdo do arquivo.",
    response: `{
  "id": "uuid-do-documento",
  "filename": "contrato.pdf",
  "size": 248112,
  "client_id": "uuid-do-cliente"
}`,
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
  {
    method: "GET",
    route: "/notifications",
    path: "/notifications",
    title: "Listar notificações",
    description: "Lista as notificações do usuário autenticado.",
    query: ["kind", "limit", "offset"],
    response: `[
  {
    "id": "uuid-da-notificacao",
    "kind": "announcement",
    "title": "Novo aviso",
    "body": "Conteúdo do aviso",
    "read_at": null,
    "created_at": "2026-10-12T12:00:00"
  }
]`,
  },
  {
    method: "GET",
    route: "/notifications",
    path: "/notifications/unread-count",
    title: "Contar não lidas",
    description: "Retorna as quantidades de notificações não lidas, separando avisos de mensagens do chat.",
    response: `{
  "total": 4,
  "notices": 3,
  "chat_messages": 1
}`,
  },
  {
    method: "GET",
    route: "/notifications",
    path: "/notifications/{identifier}",
    title: "Obter notificação",
    description: "Retorna uma notificação do usuário autenticado pelo ID.",
    response: `{
  "id": "uuid-da-notificacao",
  "kind": "announcement",
  "title": "Novo aviso",
  "body": "Conteúdo do aviso",
  "read_at": null,
  "created_at": "2026-10-12T12:00:00"
}`,
  },
  {
    method: "PATCH",
    route: "/notifications",
    path: "/notifications/{identifier}/read",
    title: "Marcar notificação como lida",
    description: "Marca uma notificação específica como lida.",
    response: `{
  "id": "uuid-da-notificacao",
  "kind": "announcement",
  "read_at": "2026-10-12T12:10:00"
}`,
  },
  {
    method: "PATCH",
    route: "/notifications",
    path: "/notifications/chat/{member_id}/read",
    title: "Marcar chat como lido",
    description: "Marca como lidas as notificações de chat de um membro.",
    response: `{
  "marked_read": 3
}`,
  },
  {
    method: "POST",
    route: "/admin/announcements",
    path: "/admin/announcements",
    title: "Criar aviso",
    description: "Cria um aviso para os membros. Esta rota exige uma chave pertencente a um administrador.",
    body: `{
  "title": "Manutenção programada",
  "body": "O painel ficará indisponível às 22h por alguns minutos."
}`,
    response: `{
  "id": "uuid-do-aviso",
  "title": "Manutenção programada",
  "body": "O painel ficará indisponível às 22h por alguns minutos.",
  "recipients": 6,
  "email_queued": 6,
  "created_at": "2026-10-12T12:00:00"
}`,
    notifies: true,
    adminOnly: true,
  },
];

const ROUTES: Route[] = ["/dashboard", "/clients", "/documents", "/automations", "/notifications", "/admin/announcements"];

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

const KEYWORDS: Record<Language, Set<string>> = {
  curl: new Set(["curl"]),
  javascript: new Set(["const", "let", "var", "await", "async", "new", "return", "throw", "if", "else", "true", "false", "null"]),
  python: new Set(["import", "from", "as", "def", "class", "return", "raise", "if", "else", "elif", "for", "while", "in", "True", "False", "None", "with", "async", "await"]),
  go: new Set(["package", "import", "func", "var", "const", "defer", "if", "else", "for", "range", "return", "go", "select", "switch", "case", "nil"]),
  java: new Set(["import", "class", "public", "private", "protected", "static", "final", "new", "var", "return", "throws", "throw", "if", "else", "true", "false", "null"]),
  php: new Set(["echo", "new", "function", "return", "if", "else", "foreach", "as", "true", "false", "null"]),
  csharp: new Set(["using", "var", "new", "await", "async", "return", "if", "else", "true", "false", "null", "public", "private", "class"]),
};

const TYPES = new Set(["HttpClient", "HttpRequest", "HttpResponse", "URI", "AuthenticationHeaderValue", "StringContent", "Console", "System", "Header", "DefaultClient"]);

function headersFor(endpoint: Endpoint) {
  return {
    Authorization: "Bearer SUA_CHAVE_API",
    Accept: "application/json",
    ...(endpoint.method !== "GET" && endpoint.method !== "DELETE" && endpoint.body && !endpoint.multipart
      ? { "Content-Type": "application/json" }
      : {}),
    ...endpoint.headers,
  };
}

function examplePath(path: string) {
  return path.replace("{identifier}", "SEU_ID").replace("{member_id}", "ID_DO_MEMBRO");
}

function requestExample(endpoint: Endpoint, language: Language): string {
  const url = `${BASE_URL}${examplePath(endpoint.path)}`;
  const headers = headersFor(endpoint);
  const body = endpoint.body;

  if (endpoint.multipart && (endpoint.path === "/automations" || endpoint.path === "/automations/{identifier}")) {
    const fields = [
      ["name", endpoint.method === "POST" ? "Captura de leads" : "ChatBot Interno Nexo"],
      ["description", endpoint.method === "POST" ? "Importa e organiza novos contatos." : "Chatbot interno com suporte a texto, áudio e imagem."],
    ];
    if (language === "curl") return [
      `curl -X ${endpoint.method} "${url}"`,
      `  -H "Authorization: Bearer SUA_CHAVE_API"`,
      ...(endpoint.method === "PATCH" ? [`  -F "name=${fields[0][1]}"`, `  -F "description=${fields[1][1]}"`] : [`  -F "name=${fields[0][1]}"`, `  -F "description=${fields[1][1]}"`]),
      `  -F "file=@${endpoint.method === "POST" ? "captura-leads.json" : "chatbot-nexo-interno.json"}"${endpoint.method === "PATCH" ? "  # opcional" : ""}`,
      `  -F "image=@${endpoint.method === "POST" ? "capa.png" : "chatbot-nexo-capa.jpg"}"  # opcional`,
    ].join(" \\\n");
    if (language === "javascript") return `const form = new FormData();
form.append("name", "${fields[0][1]}");
form.append("description", "${fields[1][1]}");
${endpoint.method === "POST" ? "form.append(\"file\", document.querySelector(\"#automation-file\").files[0]);" : "const file = document.querySelector(\"#automation-file\").files[0];\nif (file) form.append(\"file\", file);"}
const image = document.querySelector("#automation-image").files[0];
if (image) form.append("image", image);

const response = await fetch("${url}", {
  method: "${endpoint.method}",
  headers: { Authorization: "Bearer SUA_CHAVE_API", Accept: "application/json" },
  body: form,
});
console.log(await response.json());`;
    if (language === "python") return `import requests

files = {}
try:
    with open("${endpoint.method === "POST" ? "captura-leads.json" : "chatbot-nexo-interno.json"}", "rb") as automation_file:
        files["file"] = automation_file
        response = requests.${endpoint.method.toLowerCase()}(
            "${url}",
            headers={"Authorization": "Bearer SUA_CHAVE_API"},
            data={"name": "${fields[0][1]}", "description": "${fields[1][1]}"},
            files=files,
            timeout=30,
        )
except FileNotFoundError:
    response = requests.${endpoint.method.toLowerCase()}(
        "${url}",
        headers={"Authorization": "Bearer SUA_CHAVE_API"},
        data={"name": "${fields[0][1]}", "description": "${fields[1][1]}"},
        timeout=30,
    )
response.raise_for_status()
print(response.json())`;
    return `# Esta rota recebe multipart/form-data. Use o exemplo cURL, JavaScript ou Python para enviar o arquivo.`;
  }

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

function highlightCode(code: string, language: Language): ReactNode[] {
  const keywords = KEYWORDS[language];
  const token = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b|\s+|.)/g;
  const parts = code.match(token) || [code];

  return parts.map((part, index) => {
    let color = "#D4D4D4";
    let fontStyle: "normal" | "italic" = "normal";
    if (/^("|'|`)/.test(part)) color = "#CE9178";
    else if (/^(\/\/|\/\*|#(?!\?php))/.test(part)) { color = "#6A9955"; fontStyle = "italic"; }
    else if (/^\d/.test(part)) color = "#B5CEA8";
    else if (keywords.has(part)) color = "#C586C0";
    else if (TYPES.has(part) || /^[A-Z][A-Za-z0-9_]*$/.test(part)) color = "#4EC9B0";
    else if (/^[A-Za-z_$][\w$]*$/.test(part)) {
      const next = parts.slice(index + 1).find(value => !/^\s+$/.test(value));
      color = next === "(" ? "#DCDCAA" : "#9CDCFE";
    }
    return <span key={`${index}-${part}`} style={{ color, fontStyle }}>{part}</span>;
  });
}

function highlightJson(code: string): ReactNode[] {
  const token = /("(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?\b|\s+|.)/g;
  return (code.match(token) || [code]).map((part, index) => {
    let color = "#D4D4D4";
    if (/^".*"\s*:$/.test(part)) color = "#9CDCFE";
    else if (/^"/.test(part)) color = "#CE9178";
    else if (/^(true|false|null)$/.test(part)) color = "#569CD6";
    else if (/^-?\d/.test(part)) color = "#B5CEA8";
    return <span key={`${index}-${part}`} style={{ color }}>{part}</span>;
  });
}

function CodeBlock({ title, value, onCopy, copied, language, json = false }: {
  title: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
  language?: Language;
  json?: boolean;
}) {
  return <div className="overflow-hidden rounded-xl border border-[#3c3c3c] bg-[#1e1e1e] shadow-inner">
    <div className="flex items-center justify-between border-b border-[#3c3c3c] bg-[#252526] px-4 py-2">
      <span className="flex items-center gap-2 text-xs font-medium text-[#cccccc]">
        {language && <span className="size-2 rounded-full" style={{ backgroundColor: LANGUAGE_COLORS[language] }} />}
        {title}
      </span>
      <Button type="button" size="sm" variant="ghost" className="text-[#cccccc] hover:bg-white/10 hover:text-white" onClick={onCopy}>
        {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}{copied ? "Copiado" : "Copiar"}
      </Button>
    </div>
    <pre className="max-h-80 overflow-auto p-4 font-mono text-xs leading-6"><code>{language ? highlightCode(value, language) : json ? highlightJson(value) : <span className="text-[#d4d4d4]">{value}</span>}</code></pre>
  </div>;
}

export function ApiDocumentation() {
  const [route, setRoute] = useState<Route>("/clients");
  const [selected, setSelected] = useState<Endpoint | null>(null);
  const [language, setLanguage] = useState<Language>("curl");
  const [copied, setCopied] = useState("");

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
          <DialogDescription>Chaves API seguem o cargo atual do titular: dev acessa automações; admin e owner acessam também clientes, dashboard e documentos. Comercial não gerencia chaves; uma chave existente fica limitada às rotas comerciais.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex min-w-[16rem] flex-col gap-2">
              <label htmlFor="api-doc-route" className="text-sm font-medium">Path</label>
              <NativeSelect id="api-doc-route" value={route} onChange={event => { setRoute(event.target.value as Route); setSelected(null); }}>
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
                      {endpoint.adminOnly && <Badge variant="outline">admin</Badge>}
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
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={METHOD_STYLE[selected.method]}>{selected.method}</Badge>
                <code className="break-all text-sm font-semibold">{selected.path}</code>
                {selected.notifies && <Badge variant="secondary"><BellRing data-icon="inline-start" /> envia notificação</Badge>}
                {selected.adminOnly && <Badge variant="outline">somente administrador</Badge>}
              </div>
              <DialogTitle>{selected.title}</DialogTitle>
              <DialogDescription>{selected.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-6 p-6">
          {selected.query?.length ? <div className="rounded-xl border bg-muted/20 p-4"><p className="mb-2 text-sm font-medium">Query params</p><div className="flex flex-wrap gap-2">{selected.query.map(item => <Badge key={item} variant="outline"><code>{item}</code></Badge>)}</div></div> : null}

          <div className="flex flex-col gap-3">
            <div><p className="text-sm font-medium">Exemplo completo</p><p className="text-xs text-muted-foreground">Escolha a linguagem. O código usa syntax highlighting inspirado no VS Code e pode ser copiado diretamente.</p></div>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Linguagem do exemplo">
              {(Object.keys(LANGUAGE_LABELS) as Language[]).map(item => <Button key={item} type="button" size="sm" variant={language === item ? "secondary" : "outline"} onClick={() => { setLanguage(item); setCopied(""); }}><span className="size-2 rounded-full" style={{ backgroundColor: LANGUAGE_COLORS[item] }} />{LANGUAGE_LABELS[item]}</Button>)}
            </div>
            <CodeBlock title={LANGUAGE_LABELS[language]} language={language} value={fullExample} copied={copied === "example"} onCopy={() => copy("example", fullExample)} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Headers</p>
              <CodeBlock title="Headers da requisição" value={Object.entries(headersFor(selected)).map(([key, value]) => `${key}: ${value}`).join("\n")} copied={copied === "headers"} onCopy={() => copy("headers", Object.entries(headersFor(selected)).map(([key, value]) => `${key}: ${value}`).join("\n"))} />
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Body</p>
              <CodeBlock title={selected.multipart ? "multipart/form-data" : "application/json"} json={!selected.multipart && Boolean(selected.body)} value={selected.body || "Este método não envia corpo na requisição."} copied={copied === "body"} onCopy={() => copy("body", selected.body || "")} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Resposta de exemplo</p>
            <CodeBlock title="Resposta" json={selected.response.trim().startsWith("{") || selected.response.trim().startsWith("[")} value={selected.response} copied={copied === "response"} onCopy={() => copy("response", selected.response)} />
          </div>
        </div>
      </>}
    </DialogContent>
  </Dialog>;
}

