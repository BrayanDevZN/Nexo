import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Pencil, RefreshCw, ShieldCheck, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { type createApi, type Member, type User } from "./api";
import { MemberPhoto } from "./MemberPhoto";
import { Busy, Feedback, Field, FieldGroup, FieldLabel, Loading, TextField, message } from "./shared";

export function Members({ api, actor, onUpdate }: { api: ReturnType<typeof createApi>; actor: User; onUpdate: (user: User) => void }) {
  const [rows, setRows] = useState<Member[]>([]);
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editing, setEditing] = useState<Member>();
  const [deleting, setDeleting] = useState<Member>();
  const serial = useRef(0);
  const load = useCallback(async () => {
    const id = ++serial.current; setLoading(true); setError("");
    const query = new URLSearchParams({ limit: "20", offset: String(offset) });
    if (status) query.set("status", status);
    try { const result = await api.request<Member[]>("/admin/users?" + query); if (id === serial.current) setRows(result); }
    catch (e) { if (id === serial.current) setError(message(e)); }
    finally { if (id === serial.current) setLoading(false); }
  }, [api, offset, status]);
  useEffect(() => { void load(); return () => { serial.current++; }; }, [load]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing || busy) return;
    const form = new FormData(event.currentTarget);
    const body: Record<string, string | null> = { name: String(form.get("name") || "").trim(), phone: String(form.get("phone") || "").trim() || null };
    if (!editing.is_principal) body.email = String(form.get("email") || "").trim();
    if (editing.status === "approved" && !editing.is_principal && editing.id !== actor.id) body.role = String(form.get("role"));
    setBusy(true); setError(""); setSuccess("");
    try {
      const updated = await api.mutate<Member>("/admin/users/" + editing.id, "PATCH", body);
      if (updated.id === actor.id) onUpdate(updated);
      setEditing(undefined); setSuccess("Membro atualizado."); await load();
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  async function remove() {
    if (!deleting || busy) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await api.mutate("/admin/users/" + deleting.id, "DELETE");
      setDeleting(undefined); setSuccess("Membro excluído. Os clientes e documentos foram preservados.");
      if (rows.length === 1 && offset > 0) setOffset(offset - 20); else await load();
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  return <section className="flex flex-col gap-6" aria-labelledby="members-title">
    <div className="admin-section-head"><div><span className="admin-eyebrow">EQUIPE NEXO</span><h1 id="members-title">Membros</h1><p>Gerencie os dados e os cargos de quem usa o painel.</p></div><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw data-icon="inline-start" /> Atualizar membros</Button></div>
    <Feedback error={editing || deleting ? "" : error} success={success} />
    <Card><CardHeader><CardTitle>Controle da equipe</CardTitle><CardDescription>Membros aprovados gerenciam clientes. Administradores também controlam usuários.</CardDescription></CardHeader><CardContent><FieldGroup><Field><FieldLabel htmlFor="members-status">Situação do acesso</FieldLabel><NativeSelect id="members-status" value={status} onChange={event => { setOffset(0); setStatus(event.target.value); }}><NativeSelectOption value="">Todos</NativeSelectOption><NativeSelectOption value="approved">Aprovados</NativeSelectOption><NativeSelectOption value="pending">Pendentes</NativeSelectOption><NativeSelectOption value="rejected">Recusados</NativeSelectOption></NativeSelect></Field></FieldGroup></CardContent></Card>
    {loading ? <Loading /> : !rows.length && !error ? <Empty><EmptyHeader><EmptyMedia variant="icon"><Users /></EmptyMedia><EmptyTitle>Nenhum membro nesta lista</EmptyTitle><EmptyDescription>Altere o filtro ou aguarde novos cadastros.</EmptyDescription></EmptyHeader></Empty> : <div className="admin-client-grid">{rows.map(person => <Card key={person.id}>
      <CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-3"><MemberPhoto api={api} id={person.id} name={person.name} hasPhoto={!!person.profile_photo} /><CardTitle>{person.name}</CardTitle></div><Badge variant={person.role === "admin" ? "default" : "secondary"}>{person.is_principal ? "Admin principal" : person.role === "admin" ? "Administrador" : "Membro"}</Badge></div><CardDescription>{person.status === "approved" ? "Aprovado" : person.status === "pending" ? "Aguardando aprovação" : "Recusado"}</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-2"><p className="break-all text-sm">{person.email}</p><p className="text-sm text-muted-foreground">{person.phone || "Celular não informado"}</p>{person.is_principal && <p className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="size-4" />Conta principal protegida</p>}</CardContent>
      <CardFooter className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { setError(""); setEditing(person); }} aria-label={"Editar membro " + person.name}><Pencil data-icon="inline-start" /> Editar</Button><Button variant="destructive" disabled={person.is_principal || person.id === actor.id} onClick={() => { setError(""); setDeleting(person); }} aria-label={"Excluir membro " + person.name}><Trash2 data-icon="inline-start" /> Excluir</Button></CardFooter>
    </Card>)}</div>}
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Página {offset / 20 + 1} · {rows.length} membros</p><div className="flex gap-2"><Button variant="outline" disabled={loading || !offset} onClick={() => setOffset(offset - 20)}>Anterior</Button><Button variant="outline" disabled={loading || rows.length < 20} onClick={() => setOffset(offset + 20)}>Próxima</Button></div></div>
    <Dialog open={!!editing} onOpenChange={open => { if (!open && !busy) { setEditing(undefined); setError(""); } }}><DialogContent showCloseButton={!busy}><DialogHeader><DialogTitle>Editar membro</DialogTitle><DialogDescription>Alterar email ou cargo encerra as sessões desta conta. A senha permanece privada.</DialogDescription></DialogHeader><Feedback error={error} /><form onSubmit={save} className="flex flex-col gap-5"><FieldGroup>
      <TextField label="Nome completo" name="name" defaultValue={editing?.name} required maxLength={120} />
      <TextField label="E-mail" name="email" type="email" defaultValue={editing?.email} required readOnly={editing?.is_principal} help={editing?.is_principal ? "O email principal é definido no ambiente da aplicação." : undefined} />
      <TextField label="Celular" name="phone" type="tel" defaultValue={editing?.phone || ""} minLength={10} maxLength={30} />
      <Field><FieldLabel htmlFor="member-role">Cargo</FieldLabel><NativeSelect id="member-role" name="role" defaultValue={editing?.role} disabled={editing?.status !== "approved" || editing?.is_principal || editing?.id === actor.id}><NativeSelectOption value="member">Membro</NativeSelectOption><NativeSelectOption value="admin">Administrador</NativeSelectOption></NativeSelect><p className="text-sm text-muted-foreground">O cargo só pode ser alterado após a aprovação do acesso.</p></Field>
    </FieldGroup><DialogFooter><Button variant="outline" type="button" disabled={busy} onClick={() => setEditing(undefined)}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? <Busy /> : "Salvar membro"}</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={!!deleting} onOpenChange={open => { if (!open && !busy) { setDeleting(undefined); setError(""); } }}><DialogContent showCloseButton={!busy}><DialogHeader><DialogTitle>Excluir membro?</DialogTitle><DialogDescription>{deleting?.name} perderá o acesso e a conta será excluída. Os clientes e documentos cadastrados por esta pessoa serão mantidos sob responsabilidade do admin principal.</DialogDescription></DialogHeader><Feedback error={error} /><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setDeleting(undefined)}>Cancelar</Button><Button variant="destructive" disabled={busy} onClick={() => void remove()}>{busy ? <Busy /> : "Confirmar exclusão do membro"}</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
