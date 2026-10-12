import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, Clock3, ExternalLink, RefreshCw, Send, Workflow, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { type createApi, type User } from "./api";
import { Busy, Feedback, Loading, message } from "./shared";

const N8N_URL = "https://n8n.nexoaicompany.com";

type AutomationRequest = {
  id: string;
  requested_by_id: string;
  requester_name: string;
  requester_email: string;
  details: string | null;
  status: "pending" | "invited" | "rejected";
  invite_url: string | null;
  admin_message: string | null;
  reviewed_by_id: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

const statusLabel: Record<AutomationRequest["status"], string> = {
  pending: "Aguardando análise", invited: "Convite enviado", rejected: "Recusada",
};

function dateLabel(value: string) {
  return new Date(value.endsWith("Z") ? value : value + "Z").toLocaleString("pt-BR");
}

export function AutomationRequests({ api, user }: { api: ReturnType<typeof createApi>; user: User }) {
  const [rows, setRows] = useState<AutomationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selected, setSelected] = useState<AutomationRequest>();
  const [action, setAction] = useState<"invite" | "reject">("invite");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const all: AutomationRequest[] = [];
      for (let offset = 0; ; offset += 100) {
        const page = await api.request<AutomationRequest[]>(`/automation-requests?limit=100&offset=${offset}`);
        all.push(...page);
        if (page.length < 100) break;
      }
      setRows(all);
    } catch (e) { setError(message(e)); }
    finally { setLoading(false); }
  }, [api]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const onRealtime = (event: Event) => {
      const type = (event as CustomEvent).detail.type;
      if (["ready", "notifications.changed"].includes(type)) void load();
    };
    window.addEventListener("nexo:realtime", onRealtime);
    return () => window.removeEventListener("nexo:realtime", onRealtime);
  }, [load]);

  const pending = useMemo(() => rows.filter(row => row.status === "pending").length, [rows]);
  const activeRequest = rows.find(row => row.status === "pending");

  async function requestAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const details = String(new FormData(form).get("details") || "").trim();
    setBusy(true); setError(""); setSuccess("");
    try {
      await api.mutate("/automation-requests", "POST", { details: details || null });
      setSuccess("Solicitação enviada. O administrador será avisado nas notificações da Nexo.");
      form.reset();
      await load();
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }

  async function decide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || busyId) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const body = action === "invite"
      ? { invite_url: String(fields.get("invite_url") || "").trim(), message: String(fields.get("message") || "").trim() }
      : { message: String(fields.get("reason") || "").trim() };
    setBusyId(selected.id); setError(""); setSuccess("");
    try {
      await api.mutate(`/automation-requests/${selected.id}/${action}`, "POST", body);
      setSuccess(action === "invite" ? "Convite enviado por e-mail e registrado nas notificações da Nexo." : "Solicitação recusada e usuário notificado.");
      setSelected(undefined);
      await load();
    } catch (e) { setError(message(e)); }
    finally { setBusyId(""); }
  }

  return <section className="flex flex-col gap-6" aria-labelledby="automations-title">
    <div className="admin-section-head">
      <div><span className="admin-eyebrow">AUTOMAÇÃO DE PROCESSOS</span><h1 id="automations-title">Automações</h1><p>Acesse o n8n e solicite uma conta para criar fluxos de trabalho.</p></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw data-icon="inline-start" /> Atualizar</Button>
        <Button asChild><a href={N8N_URL} target="_blank" rel="noreferrer">Abrir n8n <ExternalLink data-icon="inline-end" /></a></Button>
      </div>
    </div>
    <Feedback error={error} success={success} />

    <Tabs defaultValue={user.role === "admin" ? "requests" : "access"}>
      <TabsList className="w-full sm:w-fit">
        <TabsTrigger value="access">Acesso ao n8n</TabsTrigger>
        {user.role === "admin" && <TabsTrigger value="requests">Solicitações {pending > 0 && <Badge>{pending}</Badge>}</TabsTrigger>}
      </TabsList>

      <TabsContent value="access" className="mt-4 flex flex-col gap-5">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Workflow /> Pedir criação de conta</CardTitle><CardDescription>Seu pedido será registrado na Nexo e aparecerá nas notificações dos administradores.</CardDescription></CardHeader>
          <CardContent>
            {activeRequest ? <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
              <div className="flex items-center gap-2"><Clock3 className="text-primary" /><p className="font-medium">Sua solicitação está aguardando análise.</p></div>
              <p className="text-sm text-muted-foreground">Enviada em {dateLabel(activeRequest.created_at)}. O administrador vai enviar o convite por e-mail quando liberar sua conta.</p>
              {activeRequest.details && <p className="whitespace-pre-wrap text-sm">{activeRequest.details}</p>}
            </div> : <form onSubmit={requestAccount} className="flex flex-col gap-5">
              <FieldGroup>
                <Field><FieldLabel htmlFor="automation-details">O que você pretende automatizar? (opcional)</FieldLabel><Textarea id="automation-details" name="details" maxLength={2000} placeholder="Conte brevemente como pretende usar o n8n…" /></Field>
              </FieldGroup>
              <div><Button type="submit" disabled={busy}>{busy ? <Busy /> : <><Send data-icon="inline-start" /> Enviar solicitação</>}</Button></div>
            </form>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Solicitações anteriores</CardTitle><CardDescription>Seus pedidos e o status de cada convite.</CardDescription></CardHeader>
          <CardContent>
            {loading ? <Loading /> : rows.length === 0 ? <p className="text-sm text-muted-foreground">Você ainda não enviou uma solicitação.</p> : <div className="flex flex-col gap-3">
              {rows.map(row => <div key={row.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-col gap-1"><div className="flex flex-wrap items-center gap-2"><Badge variant={row.status === "invited" ? "default" : row.status === "rejected" ? "destructive" : "secondary"}>{statusLabel[row.status]}</Badge><span className="text-xs text-muted-foreground">{dateLabel(row.created_at)}</span></div>
                  {row.details && <p className="whitespace-pre-wrap text-sm">{row.details}</p>}{row.admin_message && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{row.admin_message}</p>}
                </div>
                {row.status === "invited" && row.invite_url && <Button variant="outline" asChild><a href={row.invite_url} target="_blank" rel="noreferrer">Abrir convite <ExternalLink data-icon="inline-end" /></a></Button>}
              </div>)}
            </div>}
          </CardContent>
        </Card>
      </TabsContent>

      {user.role === "admin" && <TabsContent value="requests" className="mt-4 flex flex-col gap-5">
        <Card><CardHeader><CardTitle>Solicitações de conta n8n</CardTitle><CardDescription>Envie um link de convite ou recuse o pedido. O link será enviado em um e-mail personalizado e ficará disponível na notificação do solicitante.</CardDescription></CardHeader></Card>
        {loading ? <Loading /> : rows.length === 0 ? <Card><CardContent className="p-6 text-sm text-muted-foreground">Ainda não há solicitações de conta n8n.</CardContent></Card> : <div className="admin-client-grid">
          {rows.map(row => <Card key={row.id}>
            <CardHeader><div className="flex flex-wrap items-start justify-between gap-2"><div><CardTitle>{row.requester_name}</CardTitle><CardDescription className="break-all">{row.requester_email}</CardDescription></div><Badge variant={row.status === "invited" ? "default" : row.status === "rejected" ? "destructive" : "secondary"}>{statusLabel[row.status]}</Badge></div><CardDescription>{dateLabel(row.created_at)}</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3">{row.details && <p className="whitespace-pre-wrap text-sm">{row.details}</p>}{row.admin_message && <p className="whitespace-pre-wrap text-sm text-muted-foreground">Resposta: {row.admin_message}</p>}{row.status === "invited" && row.invite_url && <a href={row.invite_url} target="_blank" rel="noreferrer" className="break-all text-sm text-primary underline">Link enviado</a>}</CardContent>
            {row.status === "pending" && <CardFooter className="flex flex-wrap gap-2"><Button disabled={!!busyId} onClick={() => { setError(""); setAction("invite"); setSelected(row); }}><Send data-icon="inline-start" /> Enviar link</Button><Button variant="destructive" disabled={!!busyId} onClick={() => { setError(""); setAction("reject"); setSelected(row); }}><X data-icon="inline-start" /> Recusar</Button></CardFooter>}
          </Card>)}
        </div>}
      </TabsContent>}
    </Tabs>

    <Dialog open={!!selected} onOpenChange={open => { if (!open && !busyId) { setSelected(undefined); setError(""); } }}>
      <DialogContent showCloseButton={!busyId}>
        <DialogHeader><DialogTitle>{action === "invite" ? "Enviar convite do n8n" : "Recusar solicitação"}</DialogTitle><DialogDescription>{action === "invite" ? `O e-mail será enviado para ${selected?.requester_email}. Cole o link de convite gerado no n8n.` : `A solicitação de ${selected?.requester_name} será encerrada e a pessoa receberá uma notificação na Nexo.`}</DialogDescription></DialogHeader>
        <Feedback error={error} />
        <form id="automation-decision-form" onSubmit={decide} className="flex flex-col gap-5"><FieldGroup>
          {action === "invite" ? <>
            <Field><FieldLabel htmlFor="automation-invite-url">Link de convite do n8n</FieldLabel><Input id="automation-invite-url" type="url" name="invite_url" required placeholder="https://n8n.nexoaicompany.com/..." pattern="https://n8n\.nexoaicompany\.com(/.*)?" title="Use um link HTTPS de convite do domínio n8n.nexoaicompany.com" /></Field>
            <Field><FieldLabel htmlFor="automation-invite-message">Mensagem personalizada</FieldLabel><Textarea id="automation-invite-message" name="message" maxLength={3000} placeholder="Olá! Sua conta n8n foi liberada. Use o botão abaixo para concluir o cadastro." /></Field>
          </> : <Field><FieldLabel htmlFor="automation-reject-reason">Mensagem para a pessoa (opcional)</FieldLabel><Textarea id="automation-reject-reason" name="reason" maxLength={1000} placeholder="Explique brevemente a decisão, se quiser…" /></Field>}
        </FieldGroup></form>
        <DialogFooter><Button variant="outline" disabled={!!busyId} onClick={() => setSelected(undefined)}>Cancelar</Button><Button type="submit" form="automation-decision-form" variant={action === "reject" ? "destructive" : "default"} disabled={!!busyId}>{busyId ? <Busy /> : action === "invite" ? <><Send data-icon="inline-start" /> Enviar e-mail e notificação</> : <><Check data-icon="inline-start" /> Confirmar recusa</>}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
