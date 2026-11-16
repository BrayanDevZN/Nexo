import { useEffect, useState, type FormEvent } from "react";
import { Copy, KeyRound, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Busy, Feedback, TextField, message } from "@/admin/shared";
import type { BookingApi } from "./api";

type ApiKey = { id: string; name: string; key_prefix: string; created_at: string; last_used_at: string | null };
const when = (value: string | null) => value ? new Date(value.endsWith("Z") ? value : value + "Z").toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "nunca";

/** Keys for the Nexo node of n8n and for scripts: they act as this account, in every business it belongs to. */
export function ApiKeys({ api }: { api: BookingApi }) {
  const [keys, setKeys] = useState<ApiKey[]>();
  const [created, setCreated] = useState<{ name: string; key: string }>();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load() { try { setKeys(await api.request<ApiKey[]>("/auth/api-keys")); } catch (e) { setError(message(e)); } }
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") || "").trim();
    setBusy(true); setError(""); setCopied(false);
    try {
      const made = await api.mutate<ApiKey & { key: string }>("/auth/api-keys", "POST", { name });
      setCreated({ name: made.name, key: made.key }); form.reset(); api.invalidate(); await load();
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  async function revoke(key: ApiKey) {
    if (busy || !window.confirm(`Revogar a chave "${key.name}"? Quem usa essa chave perde o acesso na hora.`)) return;
    setBusy(true); setError("");
    try { await api.mutate("/auth/api-keys/" + key.id, "DELETE"); setCreated(undefined); api.invalidate(); await load(); }
    catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  async function copy() {
    if (!created) return;
    try { await navigator.clipboard.writeText(created.key); setCopied(true); } catch { setError("Não foi possível copiar. Selecione a chave e copie manualmente."); }
  }
  return <Card>
    <CardHeader><CardTitle>Chave de API</CardTitle>
      <CardDescription>Para o node Nexo do n8n e scripts. A chave age como a sua conta: vê e altera os negócios de que você faz parte.</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-4">
      <Feedback error={error} />
      {created && <Alert role="status"><KeyRound aria-hidden="true" /><AlertTitle>Chave "{created.name}" criada</AlertTitle>
        <AlertDescription><p>Copie agora: ela não aparece de novo.</p>
          <p className="bk-link-box" data-testid="new-api-key">{created.key}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void copy()}><Copy data-icon="inline-start" />{copied ? "Copiado" : "Copiar chave"}</Button></AlertDescription></Alert>}
      <form onSubmit={create} className="flex flex-col gap-3">
        <TextField label="Nome da chave" name="name" required maxLength={80} placeholder="Ex.: n8n" />
        <Button type="submit" disabled={busy}>{busy ? <Busy>Criando…</Busy> : "Criar chave"}</Button>
      </form>
      {!keys ? <Busy /> : keys.length > 0 && <ul className="flex flex-col gap-2" aria-label="Suas chaves">
        {keys.map(key => <li key={key.id} className="bk-item" style={{ cursor: "default" }}>
          <div className="bk-item-body"><strong>{key.name}</strong><span>{key.key_prefix}… · último uso: {when(key.last_used_at)}</span></div>
          <Button type="button" size="icon-sm" variant="outline" aria-label={"Revogar a chave " + key.name} disabled={busy} onClick={() => void revoke(key)}><Trash2 /></Button>
        </li>)}
      </ul>}
    </CardContent>
  </Card>;
}
