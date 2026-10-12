import { useMemo, useState } from "react";
import { BellRing, BookOpen, Braces, ChevronDown, ChevronUp, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const BASE_URL = "https://nexo-production-60a0.up.railway.app";

type Method = "GET" | "POST" | "PATCH" | "DELETE";
type RouteGroup = "/dashboard" | "/clients" | "/documents";

type Endpoint = {
  group: RouteGroup;
  method: Method;
  path: string;
  title: string;
  description: string;
  details?: string;
  headers: Record<string, string>;
  body?: string;
  response?: string;
  notifies?: boolean;
};

const JSON_HEADERS = {
  Authorization: "Bearer SUA_CHAVE_API",
  Accept: "application/json",
  "Content-Type": "application/json",
};

const READ_HEADERS = {
  Authorization: "Bearer SUA_CHAVE_API",
  Accept: "application/json",
};

const ENDPOINTS: Endpoint[] = [
  {
    group: "/dashboard",
    method: "GET",
    path: "/dashboard",
    title: "Resumo do negócio",
    description: "Retorna os indicadores usados pelo dashboard administrativo.",
    headers: READ_HEADERS,
    response: "JSON com métricas agregadas do negócio.",
  },
  {
    group: "/clients",
    method: "GET",
    path: "/clients",
    title: "Listar clientes",
    description: "Lista clientes com paginação e filtros opcionais.",
    details: "Query params: niche, name, created_by_id, pipeline_stage, contract_closed, limit (1-100) e offset.",
    headers: READ_HEADERS,
    response: "Lista de clientes.",
  },
  {
    group: "/clients",
    method: "GET",
    path: "/clients/{identifier}",
    title: "Buscar cliente",
    description: "Retorna um cliente pelo ID.",
    headers: READ_HEADERS,
    response: "Objeto do cliente.",
  },
  {
    group: "/clients",
    method: "POST",
    path: "/clients",
    title: "Criar cliente",
    description: "Cria um cliente e registra a alteração no painel.",
    headers: JSON_HEADERS,
    body: `{
  "name": "Empresa Exemplo",
  "niche": "Contabilidade",
  "phone": "31999999999",
  "email": "contato@empresa.com",
  "pipeline_stage": "lead",
  "contract_closed": false,
  "contract_value": 1500,
  "next_follow_up": null,
  "notes": "Lead vindo pela API",
  "pain": null,
  "approach": null,
  "idempotency_key": "550e8400-e29b-41d4-a716-446655440000"
}`,
    response: "Cliente criado. HTTP 201.",
    notifies: true,
  },
  {
    group: "/clients",
    method: "PATCH",
    path: "/clients/{identifier}",
    title: "Atualizar cliente",
    description: "Atualiza somente os campos enviados no corpo da requisição.",
    details: "Pode alterar etapa do funil, valor, follow-up, contato, contrato e demais campos do cliente.",
    headers: JSON_HEADERS,
    body: `{
  "pipeline_stage": "won",
  "contract_closed": true,
  "contract_value": 2500,
  "next_follow_up": null
}`,
    response: "Cliente atualizado.",
    notifies: true,
  },
  {
    group: "/clients",
    method: "DELETE",
    path: "/clients/{identifier}",
    title: "Excluir cliente",
    description: "Remove o cliente pelo ID.",
    headers: READ_HEADERS,
    response: "Sem conteúdo. HTTP 204.",
    notifies: true,
  },
  {
    group: "/documents",
    method: "GET",
    path: "/documents",
    title: "Listar documentos",
    description: "Lista documentos enviados para o painel.",
    details: "Query params: client_id, limit (1-100) e offset.",
    headers: READ_HEADERS,
    response: "Lista de documentos.",
  },
  {
    group: "/documents",
    method: "POST",
    path: "/documents",
    title: "Enviar documento",
    description: "Envia um arquivo usando multipart/form-data.",
    details: "Campo obrigatório: file. Query param opcional: client_id.",
    headers: {
      Authorization: "Bearer SUA_CHAVE_API",
      Accept: "application/json",
      "Content-Type": "multipart/form-data",
    },
    body: `file: <arquivo binário>
client_id: opcional, enviado como query param

Exemplo:
POST /documents?client_id=ID_DO_CLIENTE`,
    response: "Metadados do documento criado. HTTP 201.",
  },
  {
    group: "/documents",
    method: "GET",
    path: "/documents/{identifier}/download",
    title: "Baixar documento",
    description: "Baixa o conteúdo binário de um documento.",
    headers: {
      Authorization: "Bearer SUA_CHAVE_API",
      Accept: "application/octet-stream",
    },
    response: "Arquivo binário em application/octet-stream.",
  },
  {
    group: "/documents",
    method: "DELETE",
    path: "/documents/{identifier}",
    title: "Excluir documento",
    description: "Remove o documento pelo ID.",
    headers: READ_HEADERS,
    response: "Sem conteúdo. HTTP 204.",
  },
];

const GROUPS: { value: RouteGroup; label: string }[] = [
  { value: "/dashboard", label: "/dashboard" },
  { value: "/clients", label: "/clients" },
  { value: "/documents", label: "/documents" },
];

const METHOD_STYLE: Record<Method, string> = {
  GET: "bg-sky-500/10 text-sky-600 border-sky-500/30",
  POST: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  PATCH: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  DELETE: "bg-rose-500/10 text-rose-600 border-rose-500/30",
};

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-[#3c3c3c] bg-[#1e1e1e] p-4 font-mono text-xs leading-6 text-[#d4d4d4]">
      <code>{children}</code>
    </pre>
  );
}

export function ApiDocumentation() {
  const [group, setGroup] = useState<RouteGroup>("/clients");
  const [openBody, setOpenBody] = useState<string | null>(null);
  const [openHeaders, setOpenHeaders] = useState<string | null>(null);

  const endpoints = useMemo(() => ENDPOINTS.filter(endpoint => endpoint.group === group), [group]);

  function endpointKey(endpoint: Endpoint) {
    return `${endpoint.method}:${endpoint.path}`;
  }

  function selectGroup(next: RouteGroup) {
    setGroup(next);
    setOpenBody(null);
    setOpenHeaders(null);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <BookOpen className="size-4" />
          Ver documentação
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-hidden p-0">
        <div className="flex max-h-[92vh] flex-col">
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle>Documentação da API</DialogTitle>
            <DialogDescription>
              Selecione uma rota para ver os métodos disponíveis, headers, corpo da requisição e resposta.
            </DialogDescription>
          </DialogHeader>

          <div className="border-b bg-muted/20 px-6 py-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">URL base</p>
                <code className="mt-1 block overflow-x-auto text-sm">{BASE_URL}</code>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Autenticação padrão</p>
                <code className="mt-1 block overflow-x-auto text-sm">Authorization: Bearer SUA_CHAVE_API</code>
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <aside className="shrink-0 border-b bg-muted/10 p-3 md:w-52 md:border-b-0 md:border-r">
              <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Paths</p>
              <div className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible" role="tablist" aria-label="Paths da API">
                {GROUPS.map(item => (
                  <Button
                    key={item.value}
                    type="button"
                    variant={group === item.value ? "secondary" : "ghost"}
                    className="justify-start font-mono"
                    onClick={() => selectGroup(item.value)}
                    aria-selected={group === item.value}
                    role="tab"
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </aside>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Path selecionado</p>
                  <h3 className="font-mono text-xl font-semibold">{group}</h3>
                </div>
                <Badge variant="secondary">{endpoints.length} {endpoints.length === 1 ? "método" : "métodos"}</Badge>
              </div>

              <div className="mb-5 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
                <div className="flex items-start gap-3">
                  <BellRing className="mt-0.5 size-4 shrink-0 text-primary" />
                  <p>
                    Operações marcadas com “envia notificação” criam o aviso interno e também enviam push para os dispositivos com notificações ativadas, inclusive quando a alteração foi feita usando chave API.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                {endpoints.map(endpoint => {
                  const key = endpointKey(endpoint);
                  const bodyOpen = openBody === key;
                  const headersOpen = openHeaders === key;
                  const headerText = Object.entries(endpoint.headers).map(([name, value]) => `${name}: ${value}`).join("\n");

                  return (
                    <article key={key} className="overflow-hidden rounded-xl border bg-background">
                      <div className="p-4 md:p-5">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className={METHOD_STYLE[endpoint.method]}>{endpoint.method}</Badge>
                              <code className="break-all text-sm font-semibold">{endpoint.path}</code>
                              {endpoint.notifies && <Badge variant="secondary" className="gap-1"><BellRing className="size-3" /> envia notificação</Badge>}
                            </div>
                            <h4 className="font-semibold">{endpoint.title}</h4>
                            <p className="mt-1 text-sm text-muted-foreground">{endpoint.description}</p>
                            {endpoint.details && <p className="mt-2 text-xs text-muted-foreground">{endpoint.details}</p>}
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button type="button" size="sm" variant={headersOpen ? "secondary" : "outline"} onClick={() => setOpenHeaders(headersOpen ? null : key)}>
                            <Code2 data-icon="inline-start" />
                            {headersOpen ? "Ocultar headers" : "Ver headers"}
                            {headersOpen ? <ChevronUp /> : <ChevronDown />}
                          </Button>
                          <Button type="button" size="sm" variant={bodyOpen ? "secondary" : "outline"} onClick={() => setOpenBody(bodyOpen ? null : key)}>
                            <Braces data-icon="inline-start" />
                            {bodyOpen ? "Ocultar corpo" : "Ver corpo"}
                            {bodyOpen ? <ChevronUp /> : <ChevronDown />}
                          </Button>
                        </div>
                      </div>

                      {(headersOpen || bodyOpen) && (
                        <div className="border-t bg-muted/10 p-4 md:p-5">
                          {headersOpen && (
                            <div className={bodyOpen ? "mb-5" : ""}>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Headers</p>
                              <CodeBlock>{headerText}</CodeBlock>
                            </div>
                          )}

                          {bodyOpen && (
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Corpo da requisição</p>
                              <CodeBlock>{endpoint.body || "Este método não envia corpo na requisição."}</CodeBlock>
                            </div>
                          )}
                        </div>
                      )}

                      {endpoint.response && (
                        <div className="border-t px-4 py-3 text-sm md:px-5">
                          <span className="font-medium">Resposta: </span>
                          <span className="text-muted-foreground">{endpoint.response}</span>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
