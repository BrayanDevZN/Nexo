import { useEffect, useState, type FormEvent } from "react";
import { Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ApiKey, type createApi, type CreatedApiKey, type User } from "./api";
import { Busy, Feedback, TextField, message } from "./shared";

export function ApiKeys({ api, user }: { api: ReturnType<typeof createApi>; user: User }) {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [apiKeyName, setApiKeyName] = useState("Minha integração");
  const [createdApiKey, setCreatedApiKey] = useState<CreatedApiKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    void api.request<ApiKey[]>("/auth/api-keys").then(setApiKeys).catch(error => setError(message(error)));
  }, [api]);

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

  if (user.status !== "approved") return null;
  return <section className="flex flex-col gap-6" aria-labelledby="api-keys-title">
    <div className="admin-section-head"><div><span className="admin-eyebrow">INTEGRAÇÕES</span><h1 id="api-keys-title">Chaves de API</h1><p>Conecte sistemas externos ao painel com segurança.</p></div></div>
    <Feedback error={error} success={success} />
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="size-5" /> Acesso por API</CardTitle><CardDescription>Use uma chave no header <code>Authorization: Bearer SUA_CHAVE</code> para consumir clientes, documentos e dashboards sem cookie. A chave completa aparece somente uma vez.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-5">
        <form onSubmit={create} className="flex flex-col gap-3 sm:flex-row sm:items-end"><TextField label="Nome da chave" value={apiKeyName} onChange={event => setApiKeyName(event.target.value)} maxLength={80} required /><Button type="submit" disabled={busy || !apiKeyName.trim()}>{busy ? <Busy /> : <><KeyRound data-icon="inline-start" /> Criar chave</>}</Button></form>
        {createdApiKey && <div className="flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-50 p-4 dark:bg-amber-950/20"><p className="text-sm font-medium">Copie esta chave agora. Por segurança, ela não será mostrada novamente.</p><div className="flex items-center gap-2"><code className="min-w-0 flex-1 overflow-x-auto rounded bg-background px-3 py-2 text-xs">{createdApiKey.key}</code><Button type="button" variant="outline" size="icon" onClick={() => void copy()} aria-label="Copiar chave API">{copied ? <Check /> : <Copy />}</Button></div></div>}
        {apiKeys.length > 0 ? <div className="flex flex-col gap-2">{apiKeys.map(key => <div key={key.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><p className="font-medium">{key.name}</p><p className="text-xs text-muted-foreground"><code>{key.key_prefix}••••••••</code> · criada em {new Date(key.created_at).toLocaleDateString("pt-BR")}{key.last_used_at ? " · usada por último em " + new Date(key.last_used_at).toLocaleDateString("pt-BR") : " · ainda não usada"}</p></div><Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => void revoke(key.id)}><Trash2 data-icon="inline-start" /> Revogar</Button></div>)}</div> : <p className="text-sm text-muted-foreground">Nenhuma chave ativa.</p>}
      </CardContent>
    </Card>
  </section>;
}
