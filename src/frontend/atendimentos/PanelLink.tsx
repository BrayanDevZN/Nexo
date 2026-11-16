import { useEffect, useState, type FormEvent } from "react";
import { Link2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Busy, Feedback, TextField, message } from "@/admin/shared";
import type { BookingApi } from "./api";

/** Connects the Nexo API key used in n8n to this account, for people whose panel and Atendimentos e-mails differ. */
export function PanelLink({ api }: { api: BookingApi }) {
  const [state, setState] = useState<{ linked: boolean; panel_email: string | null }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function load() { try { setState(await api.request("/auth/panel-link")); } catch (e) { setError(message(e)); } }
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const key = String(new FormData(form).get("api_key") || "").trim();
    setBusy(true); setError(""); setSuccess("");
    try { await api.mutate("/auth/panel-link", "PUT", { api_key: key }); form.reset(); api.invalidate(); setSuccess("Chave conectada. O n8n já enxerga os seus negócios."); await load(); }
    catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  async function disconnect() {
    if (busy) return;
    setBusy(true); setError(""); setSuccess("");
    try { await api.mutate("/auth/panel-link", "DELETE"); api.invalidate(); setSuccess("Chave desconectada."); await load(); }
    catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  return <Card>
    <CardHeader><CardTitle>Conectar ao n8n</CardTitle>
      <CardDescription>O node Nexo usa a chave de API da Nexo. Ela já funciona se o e-mail da conta do painel for este. Se for outro, cole a chave aqui para ligá-la a esta conta.</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-4">
      <Feedback error={error} success={success} />
      {!state ? <Busy /> : state.linked
        ? <div className="flex flex-col gap-3">
          <p className="bk-muted" data-testid="panel-linked">Conectada à conta do painel <strong>{state.panel_email}</strong>.</p>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void disconnect()}><Unlink data-icon="inline-start" />Desconectar</Button>
        </div>
        : <form onSubmit={connect} className="flex flex-col gap-3">
          <TextField label="Chave de API da Nexo" name="api_key" type="password" autoComplete="off" required minLength={10} maxLength={160} placeholder="nexo_live_…" help="É a mesma chave da credencial do n8n. Ela só é lida para confirmar de quem é." />
          <Button type="submit" disabled={busy}>{busy ? <Busy>Conectando…</Busy> : <><Link2 data-icon="inline-start" />Conectar chave</>}</Button>
        </form>}
    </CardContent>
  </Card>;
}
