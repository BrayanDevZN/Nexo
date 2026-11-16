import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Busy, Feedback, Field, FieldGroup, FieldLabel, TextField, message } from "@/admin/shared";
import { can, outranks, ROLE_HELP, ROLE_LABELS, type BookingApi, type BookingUser, type Business, type InvitableRole, type Invitation, type Member } from "./api";

const INVITABLE: InvitableRole[] = ["manager", "staff", "viewer"];

/** Who works in the business, what each person may do, and the invitation links. */
export function Team({ api, business, me, onLeft }: { api: BookingApi; business: Business; me: BookingUser; onLeft: () => void }) {
  const [members, setMembers] = useState<Member[]>();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [created, setCreated] = useState<Invitation>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const manages = can.manageTeam(business.my_role);
  const base = "/businesses/" + business.id;
  async function load() {
    try {
      setMembers(await api.request<Member[]>(base + "/members"));
      if (manages) setInvitations(await api.request<Invitation[]>(base + "/invitations"));
    } catch (e) { setError(message(e)); }
  }
  useEffect(() => { setMembers(undefined); setCreated(undefined); void load(); }, [business.id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function act(run: () => Promise<void>, text = "") {
    if (busy) return;
    setBusy(true); setError(""); setSuccess("");
    try { await run(); if (text) setSuccess(text); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    void act(async () => {
      setCreated(await api.mutate<Invitation>(base + "/invitations", "POST", { role: values.role, email: values.email || null }));
      await load();
    }, values.email ? "Convite enviado por e-mail. Você também pode copiar o link abaixo." : "Convite criado. Envie o link para a pessoa.");
  }
  const roles = INVITABLE.filter(role => outranks(business.my_role, role));
  return <section className="flex flex-col gap-4">
    <h1>Equipe</h1>
    <Feedback error={error} success={success} />
    {created?.url && <div className="bk-link-box" aria-live="polite">{created.url}<div className="bk-row" style={{ marginTop: "0.5rem" }}>
      <Button size="sm" variant="outline" onClick={() => void navigator.clipboard?.writeText(created.url!).then(() => setSuccess("Link copiado."), () => undefined)}>Copiar link</Button>
      {typeof navigator.share === "function" && <Button size="sm" variant="outline" onClick={() => void navigator.share({ title: "Convite " + business.name, url: created.url! }).catch(() => undefined)}>Compartilhar</Button>}
    </div></div>}
    {!members ? <Busy /> : <div className="bk-list">{members.map(member => {
      const mine = member.user_id === me.id;
      const editable = manages && member.role !== "owner" && !mine && outranks(business.my_role, member.role);
      return <div className="bk-item" key={member.id} style={{ cursor: "default" }}>
        <div className="bk-item-body"><strong>{member.name || "Conta removida"}{mine ? " (você)" : ""}</strong><span>{member.email}</span>
          {editable && <div className="bk-row" style={{ marginTop: "0.4rem" }}>
            <NativeSelect aria-label={"Papel de " + member.name} value={member.role} disabled={busy} onChange={e => void act(async () => {
              await api.mutate(base + "/members/" + member.user_id, "PATCH", { role: e.target.value }); await load();
            }, "Papel atualizado.")}>
              {roles.map(role => <NativeSelectOption key={role} value={role}>{ROLE_LABELS[role]}</NativeSelectOption>)}
            </NativeSelect>
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => { if (window.confirm(`Remover ${member.name} da equipe?`)) void act(async () => { await api.mutate(base + "/members/" + member.user_id, "DELETE"); await load(); }, "Pessoa removida."); }}>Remover</Button>
          </div>}
        </div>
        <Badge variant={member.role === "owner" ? "default" : "secondary"}>{ROLE_LABELS[member.role]}</Badge>
      </div>;
    })}</div>}
    {manages && roles.length > 0 && <Card><CardHeader><CardTitle>Convidar alguém</CardTitle><CardDescription>Quem receber o link entra com a própria conta Nexo Atendimentos, ou cria uma. O link vale por 7 dias.</CardDescription></CardHeader>
      <CardContent><form onSubmit={invite} className="flex flex-col gap-4">
        <FieldGroup>
          <TextField label="E-mail da pessoa" name="email" type="email" help="Opcional. Se preencher, só essa conta aceita e ela recebe o convite por e-mail." />
          <Field><FieldLabel htmlFor="bk-invite-role">O que ela pode fazer</FieldLabel>
            <NativeSelect id="bk-invite-role" name="role" defaultValue={roles.includes("staff") ? "staff" : roles[0]}>
              {roles.map(role => <NativeSelectOption key={role} value={role}>{ROLE_LABELS[role]}: {ROLE_HELP[role]}</NativeSelectOption>)}
            </NativeSelect></Field>
        </FieldGroup>
        <Button type="submit" disabled={busy}>{busy ? <Busy>Criando…</Busy> : "Criar convite"}</Button>
      </form></CardContent></Card>}
    {manages && invitations.length > 0 && <div className="flex flex-col gap-2"><h2>Convites pendentes</h2><div className="bk-list">{invitations.map(invitation => <div className="bk-item" key={invitation.id} style={{ cursor: "default" }}>
      <div className="bk-item-body"><strong>{invitation.email || "Qualquer pessoa com o link"}</strong><span>{ROLE_LABELS[invitation.role]} · vale até {new Date(invitation.expires_at.endsWith("Z") ? invitation.expires_at : invitation.expires_at + "Z").toLocaleDateString("pt-BR")}</span></div>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(async () => { await api.mutate(base + "/invitations/" + invitation.id, "DELETE"); if (created?.id === invitation.id) setCreated(undefined); await load(); }, "Convite cancelado.")}>Cancelar</Button>
    </div>)}</div></div>}
    {business.my_role !== "owner" && <Button variant="outline" disabled={busy} onClick={() => { if (window.confirm(`Sair da equipe de ${business.name}?`)) void act(async () => { await api.mutate(base + "/members/" + me.id, "DELETE"); onLeft(); }); }}>Sair desta equipe</Button>}
  </section>;
}
