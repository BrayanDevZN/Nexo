import { BookOpen, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const BASE_URL = "https://nexo-production-60a0.up.railway.app";

type Endpoint = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  title: string;
  description: string;
  details?: string;
  body?: string;
  response?: string;
  notifies?: boolean;
};

const ENDPOINTS: Endpoint[] = [
  {
    method: "GET",
    path: "/dashboard",
    title: "Resumo do negócio",
    description: "Retorna os indicadores usados pelo dashboard administrativo.",
    response: "JSON com métricas agregadas do negócio.",
  },
  {
    method: "GET",
    path: "/clients",
    title: "Listar clientes",
    description: "Lista clientes com paginação e filtros opcionais.",
    details: "Query params: niche, name, created_by_id, pipeline_stage, contract_closed, limit (1-100) e offset.",
    response: "Lista de clientes.",
  },
  {
    method: "GET",
    path: "/clients/{identifier}",
    title: "Buscar cliente",
    description: "Retorna um cliente pelo ID.",
    response: "Objeto do cliente.",
  },
  {
    method: "POST",
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
    response: "Cliente criado. HTTP 201.",
    notifies: true,
  },
  {
    method: "PATCH",
    path: "/clients/{identifier}",
    title: "Atualizar cliente",
    description: "Atualiza apenas os campos enviados.",
    details: "Use para mudar etapa do funil, valor, follow-up, contato, contrato e demais dados do cliente.",
    body: `{
  "pipeline_stage": "won",
  "contract_closed": true,
  "contract_value": 2500
}`,
    response: "Cliente atualizado.",
    notifies: true,
  },
  {
    method: "DELETE",
    path: "/clients/{identifier}",
    title: "Excluir cliente",
    description: "Remove o cliente pelo ID.",
    response: "Sem conteúdo. HTTP 204.",
    notifies: true,
  },
  {
    method: "GET",
    path: "/documents",
    title: "Listar documentos",
    description: "Lista documentos enviados para o painel.",
    details: "Query params: client_id, limit (1-100) e offset.",
    response: "Lista de documentos.",
  },
  {
    method: "POST",
    path: "/documents",
    title: "Enviar documento",
    description: "Faz upload de um arquivo usando multipart/form-data.",
    details: "Campo obrigatório: file. Query param opcional: client_id.",
    response: "Metadados do documento criado. HTTP 201.",
  },
  {
    method: "GET",
    path: "/documents/{identifier}/download",
    title: "Baixar documento",
    description: "Baixa o conteúdo binário de um documento.",
    response: "application/octet-stream.",
  },
  {
    method: "DELETE",
    path: "/documents/{identifier}",
    title: "Excluir documento",
    description: "Remove o documento pelo ID.",
    response: "Sem conteúdo. HTTP 204.",
  },
];

const METHOD_STYLE: Record<Endpoint["method"], string> = {
  GET: "bg-sky-500/10 text-sky-600 border-sky-500/30",
  POST: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  PATCH: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  DELETE: "bg-rose-500/10 text-rose-600 border-rose-500/30",
};

export function ApiDocumentation() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <BookOpen className="size-4" />
          Ver documentação
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Documentação da API</DialogTitle>
          <DialogDescription>
            Endpoints disponíveis para integrações autenticadas com chave API.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">URL base</p>
              <code className="mt-1 block overflow-x-auto text-sm">{BASE_URL}</code>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Autenticação</p>
              <code className="mt-1 block overflow-x-auto text-sm">Authorization: Bearer SUA_CHAVE_API</code>
            </div>
          </div>

          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
            <div className="flex items-start gap-3">
              <BellRing className="mt-0.5 size-4 shrink-0 text-primary" />
              <p>
                Alterações feitas com chave API passam pelo mesmo fluxo do painel. Quando uma operação gera aviso,
                ela também cria a notificação interna e envia push para os dispositivos com notificações ativadas.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {ENDPOINTS.map(endpoint => (
              <article key={`${endpoint.method}-${endpoint.path}`} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={METHOD_STYLE[endpoint.method]}>{endpoint.method}</Badge>
                      <code className="break-all text-sm font-semibold">{endpoint.path}</code>
                      {endpoint.notifies && <Badge variant="secondary" className="gap-1"><BellRing className="size-3" /> envia notificação</Badge>}
                    </div>
                    <h3 className="font-semibold">{endpoint.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{endpoint.description}</p>
                    {endpoint.details && <p className="mt-2 text-xs text-muted-foreground">{endpoint.details}</p>}
                  </div>
                </div>

                {endpoint.body && (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Body JSON</p>
                    <pre className="overflow-x-auto rounded-lg border border-[#3c3c3c] bg-[#1e1e1e] p-4 text-xs leading-6 text-[#d4d4d4]"><code>{endpoint.body}</code></pre>
                  </div>
                )}

                {endpoint.response && (
                  <div className="mt-3 text-sm">
                    <span className="font-medium">Resposta: </span>
                    <span className="text-muted-foreground">{endpoint.response}</span>
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
