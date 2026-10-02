import { useCallback, useEffect, useState } from "react";
import { Check, RefreshCw, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { type createApi, type Approval, type User } from "./api";
import { Busy, Feedback, Loading, message } from "./shared";

export function Approvals({ api, onChanged }: { api: ReturnType<typeof createApi>; onChanged: () => void }) {
  const [notes, setNotes] = useState<Approval[]>([]);
  const [users, setUsers] = useState<Record<string, User>>({});
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirm, setConfirm] = useState<{ note: Approval; decision: "approved" | "rejected" }>();
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const list = await api.request<Approval[]>("/admin/notifications?unresolved_only=true&limit=20&offset=" + offset);
      const people: Record<string, User> = {};
      if (list.length) {
        let page = 0;
        while (true) {
          const result = await api.request<User[]>("/admin/users?status=pending&limit=100&offset=" + page);
          result.forEach(user => { people[user.id] = user; });
          if (result.length < 100 || list.every(note => people[note.requested_user_id])) break;
          page += 100;
        }
      }
      setUsers(people); setNotes(list);
    } catch (e) { setError(message(e)); } finally { setLoading(false); }
  }, [api, offset]);
  useEffect(() => { void load(); }, [load]);
  async function decide() {
    if (!confirm) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await api.mutate("/admin/notifications/" + confirm.note.id + "/decision", "POST", { decision: confirm.decision });
      setSuccess(confirm.decision === "approved" ? "Acesso autorizado." : "Solicitação recusada.");
      setConfirm(undefined); onChanged();
      if (notes.length === 1 && offset > 0) setOffset(offset - 20); else await load();
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  return <section className="flex flex-col gap-6">
    <div className="admin-section-head"><div><span className="admin-eyebrow">CONTROLE DE ACESSO</span><h1>Solicitações</h1><p>Decida quem pode acessar os dados da Nexo.</p></div><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw data-icon="inline-start" /> Atualizar</Button></div>
    <Feedback error={confirm ? "" : error} success={success} />
    {loading ? <Loading /> : !notes.length && !error ? <Empty><EmptyHeader><EmptyMedia variant="icon"><Check /></EmptyMedia><EmptyTitle>Tudo em dia</EmptyTitle><EmptyDescription>Não há solicitações nesta página.</EmptyDescription></EmptyHeader></Empty> : <div className="admin-client-grid">
      {notes.map(note => {
        const user = users[note.requested_user_id];
        return <Card key={note.id}><CardHeader><div className="flex items-center justify-between gap-2"><CardTitle>{user?.name || "Cadastro em atualização"}</CardTitle><Badge variant="secondary">Pendente</Badge></div><CardDescription>{new Date(note.created_at.endsWith("Z") ? note.created_at : note.created_at + "Z").toLocaleDateString("pt-BR")}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2"><p className="break-all">{user?.email}</p><p>{user?.phone}</p><p className="text-sm text-muted-foreground">Ao autorizar, esta pessoa poderá consultar e gerenciar todos os clientes.</p></CardContent>
          <CardFooter className="flex-wrap gap-2"><Button disabled={!user || busy} onClick={() => { setError(""); setConfirm({ note, decision: "approved" }); }}><Check data-icon="inline-start" /> Autorizar</Button><Button variant="destructive" disabled={!user || busy} onClick={() => { setError(""); setConfirm({ note, decision: "rejected" }); }}><X data-icon="inline-start" /> Recusar</Button></CardFooter>
        </Card>;
      })}
    </div>}
    <div className="flex justify-end gap-2"><Button variant="outline" disabled={loading || offset === 0} onClick={() => setOffset(offset - 20)}>Anterior</Button><Button variant="outline" disabled={loading || notes.length < 20} onClick={() => setOffset(offset + 20)}>Próxima</Button></div>
    <Dialog open={!!confirm} onOpenChange={open => { if (!open && !busy) { setConfirm(undefined); setError(""); } }}>
      <DialogContent showCloseButton={!busy}><DialogHeader><DialogTitle>{confirm?.decision === "approved" ? "Autorizar acesso?" : "Recusar acesso?"}</DialogTitle><DialogDescription>{users[confirm?.note.requested_user_id || ""]?.name}: {confirm?.decision === "approved" ? "poderá ver e alterar os clientes." : "não poderá entrar no painel. Essa decisão encerra a solicitação."}</DialogDescription></DialogHeader><Feedback error={error} />
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setConfirm(undefined)}>Cancelar</Button><Button disabled={busy} variant={confirm?.decision === "rejected" ? "destructive" : "default"} onClick={() => void decide()}>{busy ? <Busy /> : "Confirmar decisão"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
