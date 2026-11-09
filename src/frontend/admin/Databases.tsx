import { useEffect, useState } from "react";
import { Database, ExternalLink, Play, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { type createApi } from "./api";
import { Busy, Feedback, Loading, message } from "./shared";

type Instance = {
  id: string; name: string; kind: "sqlite" | "redis" | "qdrant"; status: "online" | "unreachable" | "unauthorized";
  details: Record<string, string | number | null>;
  tables: { name: string; rows: number | null; columns: string[] }[];
  can_query: boolean; dashboard_url: string | null;
};
type QueryResult = { columns: string[]; rows: (string | number | null)[][]; truncated: boolean };

const STATUS: Record<Instance["status"], { label: string; variant: "default" | "secondary" | "destructive" }> = {
  online: { label: "Online", variant: "default" },
  unreachable: { label: "Sem conexão", variant: "destructive" },
  unauthorized: { label: "Chave de API recusada", variant: "destructive" },
};
const LABELS: Record<string, string> = {
  arquivo: "Arquivo", tamanho_bytes: "Tamanho", versao: "Versão", memoria: "Memória",
  clientes_conectados: "Clientes conectados", chaves: "Chaves", colecoes: "Coleções",
};
function show(key: string, value: string | number | null) {
  if (value === null || value === undefined) return "—";
  return key === "tamanho_bytes" ? `${(Number(value) / 1024 / 1024).toFixed(2)} MB` : String(value);
}

export function Databases({ api }: { api: ReturnType<typeof createApi> }) {
  const [instances, setInstances] = useState<Instance[]>();
  const [error, setError] = useState("");
  const [sql, setSql] = useState("SELECT name, niche, pipeline_stage FROM clients ORDER BY created_at DESC LIMIT 20");
  const [result, setResult] = useState<QueryResult>();
  const [queryError, setQueryError] = useState("");
  const [running, setRunning] = useState(false);
  async function load() {
    setError("");
    try { api.invalidate(); setInstances(await api.request<Instance[]>("/admin/databases")); }
    catch (e) { setError(message(e)); }
  }
  useEffect(() => { void load(); }, []);
  async function run() {
    if (running) return;
    setRunning(true); setQueryError(""); setResult(undefined);
    try { setResult(await api.mutate<QueryResult>("/admin/databases/sqlite/query", "POST", { sql })); }
    catch (e) { setQueryError(message(e)); }
    finally { setRunning(false); }
  }
  if (!instances && !error) return <Loading />;
  const sqlite = instances?.find(item => item.id === "sqlite");
  return <section className="flex flex-col gap-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">Bancos de dados</h1>
        <p className="text-sm text-muted-foreground">Instâncias usadas pela Nexo. Acesso restrito a Dev, Admin e Owner.</p></div>
      <Button variant="outline" onClick={() => void load()}><RefreshCw data-icon="inline-start" /> Atualizar</Button>
    </div>
    <Feedback error={error} />
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {instances?.map(item => <Card key={item.id}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><Database className="size-4" />{item.name}</span>
            <Badge variant={STATUS[item.status].variant}>{STATUS[item.status].label}</Badge></CardTitle>
          <CardDescription>{item.kind === "sqlite" ? "Dados da aplicação (usuários, clientes, documentos)." : item.kind === "redis" ? "Sessões, cache, códigos e tempo real." : "Coleções de vetores."}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            {Object.entries(item.details).map(([key, value]) => <div key={key} className="contents"><dt className="text-muted-foreground">{LABELS[key] || key}</dt><dd className="truncate text-right">{show(key, value)}</dd></div>)}
          </dl>
          {item.tables.length > 0 && <div className="flex flex-wrap gap-1">
            {item.tables.map(table => <Badge key={table.name} variant="secondary" title={table.columns.join(", ")}>{table.name}{table.rows !== null && ` · ${table.rows}`}</Badge>)}
          </div>}
          {item.dashboard_url && <Button asChild><a href={item.dashboard_url} target="_blank" rel="noopener noreferrer"><ExternalLink data-icon="inline-start" /> Abrir dashboard</a></Button>}
        </CardContent>
      </Card>)}
    </div>
    {sqlite?.can_query && <Card>
      <CardHeader><CardTitle>Console SQL (SQLite)</CardTitle>
        <CardDescription>Somente leitura: uma consulta SELECT por vez, até 200 linhas e 5 segundos. Senhas, identificadores do Google, chaves de API, textos do chat e conteúdo de documentos ficam ocultos.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1">{sqlite.tables.map(table => <Button key={table.name} size="sm" variant="outline" onClick={() => setSql(`SELECT * FROM ${table.name} LIMIT 50`)}>{table.name}</Button>)}</div>
        <Textarea value={sql} onChange={event => setSql(event.target.value)} rows={5} maxLength={10000} spellCheck={false} className="font-mono text-sm" aria-label="Consulta SQL" />
        <div><Button disabled={running || !sql.trim()} onClick={() => void run()}>{running ? <Busy>Executando…</Busy> : <><Play data-icon="inline-start" /> Executar consulta</>}</Button></div>
        <Feedback error={queryError} />
        {result && <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">{result.rows.length} linha(s){result.truncated && " — resultado limitado a 200 linhas"}.</p>
          <div className="max-h-96 overflow-auto rounded-md border">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-muted"><tr>{result.columns.map(column => <th key={column} className="px-3 py-2 font-medium">{column}</th>)}</tr></thead>
              <tbody>{result.rows.map((row, index) => <tr key={index} className="border-t">{row.map((cell, position) => <td key={position} className="max-w-xs truncate px-3 py-1.5 font-mono text-xs" title={cell === null ? "" : String(cell)}>{cell === null ? <span className="text-muted-foreground">NULL</span> : String(cell)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </div>}
      </CardContent>
    </Card>}
  </section>;
}
