import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Copy, Pencil, RefreshCw, ShieldCheck, ShieldOff, Trash2, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ROLE_LABELS, type BookingAccessUser, type BookingAccessUsers, type createApi, type Member, type Role, type User } from "./api";
import { AccessDecisionDialog, accessLabel, accessUntil, onLive } from "./BookingAccess";
import { MemberPhoto } from "./MemberPhoto";
import { Busy, Feedback, Field, FieldGroup, FieldLabel, Loading, TextField, message } from "./shared";

export function Members({ api, actor, onUpdate }: { api: ReturnType<typeof createApi>; actor: User; onUpdate: (user: User) => void }) {
  const canManage = actor.role === "owner";
  const canInvite = canManage;
  const [rows, setRows] = useState<Member[]>([]);
  const [principalId, setPrincipalId] = useState("");
  const isPrincipalOwner = actor.id === principalId;
  const [status, setStatus] = useState("");
  const [system, setSystem] = useState<"all" | "crm" | "atendimentos">("all");
  const [booking, setBooking] = useState<BookingAccessUser[]>([]);
  const [deciding, setDeciding] = useState<{ user: BookingAccessUser; decision: "approved" | "rejected" }>();
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSystem, setInviteSystem] = useState<"crm" | "atendimentos">("crm");
  const [inviteRole, setInviteRole] = useState<Exclude<Role, "owner">>("commercial");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [editing, setEditing] = useState<Member>();
  const [deleting, setDeleting] = useState<Member>();
  const serial = useRef(0);
  const load = useCallback(async () => {
    if (!canManage) { setRows([]); setBooking([]); setError(""); setLoading(false); return; }
    const id = ++serial.current; setLoading(true); setError("");
    const query = new URLSearchParams({ limit: "20", offset: String(offset) });
    if (status) query.set("status", status);
    // Two systems share this list: the panel (CRM) and the Atendimentos. "Expirados" only exists in the second.
    const wantsCrm = system !== "atendimentos" && status !== "expired";
    const wantsBooking = system !== "crm";
    try {
      const [result, principal, people] = await Promise.all([
        wantsCrm ? api.request<Member[]>("/admin/users?" + query) : Promise.resolve([] as Member[]),
        api.request<{ id: string }>("/admin/users/principal"),
        wantsBooking ? api.request<BookingAccessUsers>("/admin/atendimentos/users?" + query) : Promise.resolve(undefined),
      ]);
      if (id === serial.current) { setRows(result); setPrincipalId(principal.id); setBooking(people?.users ?? []); }
    }
    catch (e) { if (id === serial.current) setError(message(e)); }
    finally { if (id === serial.current) setLoading(false); }
  }, [api, offset, status, system, canManage]);
  useEffect(() => { void load(); return () => { serial.current++; }; }, [load]);
  useEffect(() => onLive(() => void load()), [load]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing || busy) return;
    const form = new FormData(event.currentTarget);
    const body: Record<string, string | null> = { name: String(form.get("name") || "").trim(), phone: String(form.get("phone") || "").trim() || null };
    if (!editing.is_principal) body.email = String(form.get("email") || "").trim();
    if (editing.status === "approved" && !editing.is_principal && editing.id !== actor.id && (editing.role !== "owner" || isPrincipalOwner)) body.role = String(form.get("role"));
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
  async function createInvitation() {
    if (inviteBusy) return;
    setInviteBusy(true); setError(""); setSuccess("");
    try {
      // CRM: the invitation carries a role. Atendimento: an access link, because there the role belongs to each business.
      const invite = inviteSystem === "crm"
        ? await api.mutate<{ url: string }>("/admin/invitations", "POST", { role: inviteRole })
        : await api.mutate<{ url: string }>("/admin/atendimentos/links", "POST", { max_uses: 1, valid_days: 7 });
      setInviteUrl(invite.url);
    } catch (e) { setError(message(e)); } finally { setInviteBusy(false); }
  }
  async function copyInvitation() {
    try { await navigator.clipboard.writeText(inviteUrl); setSuccess("Link do convite copiado."); }
    catch { setError("Não foi possível copiar automaticamente. Selecione e copie o link."); }
  }
  return <section className="flex flex-col gap-6" aria-labelledby="members-title">
    <div className="admin-section-head"><div><span className="admin-eyebrow">EQUIPE NEXO</span><h1 id="members-title">Membros</h1><p>Gerencie quem usa o painel (CRM) e o Atendimento: dados, cargos e permissões.</p></div><div className="flex flex-wrap gap-2">{canInvite && <Button onClick={() => { setInviteUrl(""); setInviteSystem("crm"); setInviteOpen(true); }}><UserPlus data-icon="inline-start" /> Criar convite</Button>}{canManage && <Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw data-icon="inline-start" /> Atualizar membros</Button>}</div></div>
    <Feedback error={editing || deleting ? "" : error} success={success} />
    {canManage && <Card><CardHeader><CardTitle>Controle da equipe</CardTitle><CardDescription>Comercial cuida de clientes e funil; Dev cuida de API e automações; Admin acessa as áreas operacionais. Apenas Owner gerencia a equipe. No Atendimento, cada pessoa tem o cargo que tem nos negócios dela.</CardDescription></CardHeader><CardContent><FieldGroup><div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="members-system">Sistema</FieldLabel><NativeSelect id="members-system" value={system} onChange={event => { setOffset(0); setSystem(event.target.value as "all" | "crm" | "atendimentos"); }}><NativeSelectOption value="all">Todos os sistemas</NativeSelectOption><NativeSelectOption value="crm">CRM</NativeSelectOption><NativeSelectOption value="atendimentos">Atendimento</NativeSelectOption></NativeSelect></Field><Field><FieldLabel htmlFor="members-status">Situação do acesso</FieldLabel><NativeSelect id="members-status" value={status} onChange={event => { setOffset(0); setStatus(event.target.value); }}><NativeSelectOption value="">Todos</NativeSelectOption><NativeSelectOption value="approved">Aprovados</NativeSelectOption><NativeSelectOption value="pending">Pendentes</NativeSelectOption><NativeSelectOption value="rejected">Recusados ou removidos</NativeSelectOption><NativeSelectOption value="expired">Expirados (Atendimento)</NativeSelectOption></NativeSelect></Field></div></FieldGroup></CardContent></Card>}
    {!canManage ? null : loading ? <Loading /> : !rows.length && !booking.length && !error ? <Empty><EmptyHeader><EmptyMedia variant="icon"><Users /></EmptyMedia><EmptyTitle>Nenhum membro nesta lista</EmptyTitle><EmptyDescription>Altere o filtro ou aguarde novos cadastros.</EmptyDescription></EmptyHeader></Empty> : <div className="admin-client-grid">{booking.map(person => <BookingMemberCard key={"b" + person.id} api={api} person={person} onDecide={(decision) => setDeciding({ user: person, decision })} />)}{rows.map(person => <Card key={person.id}>
      <CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-3"><MemberPhoto api={api} id={person.id} name={person.name} hasPhoto={!!person.profile_photo} /><CardTitle>{person.name}</CardTitle></div><div className="flex flex-wrap gap-1"><Badge variant="outline">CRM</Badge><Badge variant={person.role === "owner" ? "default" : person.role === "admin" ? "outline" : "secondary"}>{person.is_principal ? "Owner principal" : ROLE_LABELS[person.role]}</Badge></div></div><CardDescription>{person.status === "approved" ? "Aprovado" : person.status === "pending" ? "Aguardando aprovação" : "Recusado"}</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-2"><p className="break-all text-sm">{person.email}</p><p className="text-sm text-muted-foreground">{person.phone || "Celular não informado"}</p>{person.is_principal && <p className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="size-4" />Conta principal protegida</p>}</CardContent>
      <CardFooter className="flex flex-wrap gap-2"><Button variant="outline" disabled={person.is_principal && !isPrincipalOwner} onClick={() => { setError(""); setEditing(person); }} aria-label={"Editar membro " + person.name}><Pencil data-icon="inline-start" /> Editar</Button><Button variant="destructive" disabled={person.is_principal || person.id === actor.id || (person.role === "owner" && !isPrincipalOwner)} onClick={() => { setError(""); setDeleting(person); }} aria-label={"Excluir membro " + person.name}><Trash2 data-icon="inline-start" /> Excluir</Button></CardFooter>
    </Card>)}</div>}
    {canManage && <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Página {offset / 20 + 1} · {rows.length + booking.length} membros</p><div className="flex gap-2"><Button variant="outline" disabled={loading || !offset} onClick={() => setOffset(offset - 20)}>Anterior</Button><Button variant="outline" disabled={loading || (rows.length < 20 && booking.length < 20)} onClick={() => setOffset(offset + 20)}>Próxima</Button></div></div>}
    <AccessDecisionDialog api={api} user={deciding?.user} decision={deciding?.decision || "approved"} onClose={() => setDeciding(undefined)} onDone={text => { setDeciding(undefined); setSuccess(text); void load(); }} />
    <Dialog open={inviteOpen} onOpenChange={open => { if (!inviteBusy) setInviteOpen(open); }}><DialogContent><DialogHeader><DialogTitle>Criar convite para a equipe</DialogTitle><DialogDescription>Escolha primeiro o sistema do convite. Quem receber o link poderá criar uma conta com e-mail e senha ou continuar com Google. O acesso será liberado automaticamente.</DialogDescription></DialogHeader><Feedback error={error} success={success} /><Tabs value={inviteSystem} onValueChange={value => { if (!inviteUrl) setInviteSystem(value as "crm" | "atendimentos"); }}><TabsList><TabsTrigger value="crm" disabled={!!inviteUrl}>CRM</TabsTrigger><TabsTrigger value="atendimentos" disabled={!!inviteUrl}>Atendimento</TabsTrigger></TabsList></Tabs><FieldGroup>{inviteSystem === "crm" ? <Field><FieldLabel htmlFor="invite-role">Cargo</FieldLabel><NativeSelect id="invite-role" value={inviteRole} onChange={event => setInviteRole(event.target.value as Exclude<Role, "owner">)} disabled={!!inviteUrl}><NativeSelectOption value="commercial">Comercial</NativeSelectOption><NativeSelectOption value="dev">Desenvolvedor</NativeSelectOption><NativeSelectOption value="admin">Administrador</NativeSelectOption></NativeSelect></Field> : <p className="text-sm text-muted-foreground">No Atendimento não há cargo: cada pessoa tem o cargo que tem nos negócios dela. O link libera o acesso ao sistema.</p>}{inviteUrl && <Field><FieldLabel htmlFor="invite-url">Link do convite · expira em 7 dias</FieldLabel><div className="flex gap-2"><Input id="invite-url" value={inviteUrl} readOnly /><Button type="button" variant="outline" onClick={() => void copyInvitation()} aria-label="Copiar link do convite"><Copy /></Button></div></Field>}</FieldGroup><DialogFooter><Button variant="outline" onClick={() => setInviteOpen(false)} disabled={inviteBusy}>Fechar</Button>{!inviteUrl && <Button onClick={() => void createInvitation()} disabled={inviteBusy}>{inviteBusy ? <Busy /> : <><UserPlus data-icon="inline-start" /> Gerar link</>}</Button>}</DialogFooter></DialogContent></Dialog>
    <Dialog open={!!editing} onOpenChange={open => { if (!open && !busy) { setEditing(undefined); setError(""); } }}><DialogContent showCloseButton={!busy}><DialogHeader><DialogTitle>Editar membro</DialogTitle><DialogDescription>Alterar email ou cargo encerra as sessões desta conta. A senha permanece privada.</DialogDescription></DialogHeader><Feedback error={error} /><form onSubmit={save} className="flex flex-col gap-5"><FieldGroup>
      <TextField label="Nome completo" name="name" defaultValue={editing?.name} required maxLength={120} />
      <TextField label="E-mail" name="email" type="email" defaultValue={editing?.email} required readOnly={editing?.is_principal} help={editing?.is_principal ? "O email principal é definido no ambiente da aplicação." : undefined} />
      <TextField label="Celular" name="phone" type="tel" defaultValue={editing?.phone || ""} minLength={10} maxLength={30} />
      <Field><FieldLabel htmlFor="member-role">Cargo</FieldLabel><NativeSelect id="member-role" name="role" defaultValue={editing?.role} disabled={editing?.status !== "approved" || editing?.is_principal || editing?.id === actor.id || (editing?.role === "owner" && !isPrincipalOwner)}><NativeSelectOption value="commercial">Comercial</NativeSelectOption><NativeSelectOption value="dev">Desenvolvedor</NativeSelectOption><NativeSelectOption value="admin">Administrador</NativeSelectOption>{(isPrincipalOwner || editing?.role === "owner") && <NativeSelectOption value="owner">Owner</NativeSelectOption>}</NativeSelect><p className="text-sm text-muted-foreground">Somente o Owner principal pode promover, rebaixar ou excluir outros Owners. Sua própria conta principal permanece protegida.</p></Field>
    </FieldGroup><DialogFooter><Button variant="outline" type="button" disabled={busy} onClick={() => setEditing(undefined)}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? <Busy /> : "Salvar membro"}</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={!!deleting} onOpenChange={open => { if (!open && !busy) { setDeleting(undefined); setError(""); } }}><DialogContent showCloseButton={!busy}><DialogHeader><DialogTitle>Excluir membro?</DialogTitle><DialogDescription>{deleting?.name} perderá o acesso e a conta será excluída. Os clientes e documentos cadastrados por esta pessoa serão mantidos sob responsabilidade do admin principal.</DialogDescription></DialogHeader><Feedback error={error} /><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setDeleting(undefined)}>Cancelar</Button><Button variant="destructive" disabled={busy} onClick={() => void remove()}>{busy ? <Busy /> : "Confirmar exclusão do membro"}</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}


/** An account of the Atendimentos in the members list: which system, which role, and the permission with its end date. */
function BookingMemberCard({ api, person, onDecide }: { api: ReturnType<typeof createApi>; person: BookingAccessUser; onDecide: (decision: "approved" | "rejected") => void }) {
  const until = accessUntil(person);
  return <Card>
    <CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-3"><MemberPhoto api={api} id={person.id} name={person.name} hasPhoto={person.has_photo} path={"/admin/atendimentos/users/" + person.id + "/photo"} /><CardTitle>{person.name}</CardTitle></div>
      <div className="flex flex-wrap gap-1"><Badge variant="secondary">Atendimento</Badge><Badge variant={person.role === "owner" ? "default" : "outline"}>{person.role_label || "Sem negócio"}</Badge></div></div>
      <CardDescription>{accessLabel(person)}{until ? " · " + until : ""}</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-2"><p className="break-all text-sm">{person.email}</p><p className="text-sm text-muted-foreground">{person.phone || "Celular não informado"}</p>
      {person.businesses.length > 0 && <p className="text-sm text-muted-foreground">{person.businesses.map(item => item.name + " (" + ({ owner: "Dono", manager: "Gerente", staff: "Atendente", viewer: "Só leitura" } as Record<string, string>)[item.role] + ")").join(", ")}</p>}</CardContent>
    <CardFooter className="flex flex-wrap gap-2">
      {person.status === "approved" && <><Button variant="outline" onClick={() => onDecide("approved")} aria-label={"Alterar validade de " + person.name}><Pencil data-icon="inline-start" /> Validade</Button><Button variant="destructive" onClick={() => onDecide("rejected")} aria-label={"Tirar permissão de " + person.name}><ShieldOff data-icon="inline-start" /> Tirar permissão</Button></>}
      {person.status === "pending" && <><Button onClick={() => onDecide("approved")}><ShieldCheck data-icon="inline-start" /> Liberar</Button><Button variant="destructive" onClick={() => onDecide("rejected")}>Recusar</Button></>}
      {(person.status === "rejected" || person.status === "expired") && <Button onClick={() => onDecide("approved")} aria-label={"Liberar de novo " + person.name}><ShieldCheck data-icon="inline-start" /> Liberar de novo</Button>}
    </CardFooter>
  </Card>;
}
