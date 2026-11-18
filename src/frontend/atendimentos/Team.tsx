import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Busy, Feedback, Field, FieldGroup, FieldLabel, TextField, message } from "@/admin/shared";
import { Copy, Link2, Mail, Share2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { can, outranks, ROLE_HELP, ROLE_LABELS, type BookingApi, type BookingUser, type Business, type InvitableRole, type Invitation, type Member } from "./api";
import { Picture } from "./Photo";

const INVITABLE: InvitableRole[] = ["manager", "staff", "viewer"];

const clock = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
/** Why someone is not available: they said so (stays until they undo it), or they are in an appointment (ends by itself). */
function availabilityNote(member: Member) {
  if (member.unavailable) return member.busy_until ? `Marcou que está indisponível · também em atendimento até ${clock(member.busy_until)}` : "Marcou que está indisponível";
  if (member.busy_until) return `Em atendimento até ${clock(member.busy_until)}`;
  return "";
}

/** Who works in the business, what each person may do, and the invitation links. */
export function Team({ api, business, me, onLeft }: { api: BookingApi; business: Business; me: BookingUser; onLeft: () => void }) {
  const [members, setMembers] = useState<Member[]>();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [created, setCreated] = useState<Invitation>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [via, setVia] = useState<"email" | "link">("email");
  const manages = can.manageTeam(business.my_role);
  const base = "/businesses/" + business.id;
  async function load() {
    try {
      setMembers(await api.request<Member[]>(base + "/members"));
      if (manages) setInvitations(await api.request<Invitation[]>(base + "/invitations"));
    } catch (e) { setError(message(e)); }
  }
  useEffect(() => { setMembers(undefined); setCreated(undefined); void load(); }, [business.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Being in an appointment starts and ends on its own, so the list is read again every half minute to show it.
  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) void api.request<Member[]>(base + "/members").then(setMembers).catch(() => undefined); }, 30000);
    return () => window.clearInterval(timer);
  }, [api, base]);
  async function act(run: () => Promise<void>, text = "") {
    if (busy) return;
    setBusy(true); setError(""); setSuccess("");
    try { await run(); if (text) setSuccess(text); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    const email = via === "email" ? (values.email || "").trim() : "";
    void act(async () => {
      const row = await api.mutate<Invitation>(base + "/invitations", "POST", { role: values.role, email: email || null });
      setCreated(row);
      await load();
      if (via === "email") setSuccess(row.email_sent ? `Convite enviado para ${email}. A pessoa entra, ou cria a conta, e já fica na equipe.` : "O e-mail não pôde ser enviado agora. Copie o link abaixo e mande você mesmo.");
      else setSuccess("Link criado. Mande para a pessoa: ao abrir, ela entra, ou cria a conta, e já fica na equipe.");
    });
  }
  const roles = INVITABLE.filter(role => outranks(business.my_role, role));
  return <section className="flex flex-col gap-4">
    <div className="bk-head"><div><h1>Equipe</h1>{members && <p>{members.length} {members.length === 1 ? "pessoa" : "pessoas"} em {business.name}</p>}</div></div>
    <Feedback error={error} success={success} />
    {created?.url && <div className="bk-link-box" aria-live="polite">{created.url}<div className="bk-row" style={{ marginTop: "0.5rem" }}>
      <Button size="sm" variant="outline" onClick={() => void navigator.clipboard?.writeText(created.url!).then(() => setSuccess("Link copiado."), () => undefined)}><Copy data-icon="inline-start" />Copiar link</Button>
      {typeof navigator.share === "function" && <Button size="sm" variant="outline" onClick={() => void navigator.share({ title: "Convite " + business.name, url: created.url! }).catch(() => undefined)}><Share2 data-icon="inline-start" />Compartilhar</Button>}
    </div></div>}
    {!members ? <Busy /> : <div className="bk-list">{members.map(member => {
      const mine = member.user_id === me.id;
      const editable = manages && member.role !== "owner" && !mine && outranks(business.my_role, member.role);
      return <div className="bk-item" key={member.id} style={{ cursor: "default" }}>
        <Picture api={api} path={"/auth/profile/photo?user_id=" + member.user_id} name={member.name || "?"} hasPhoto={member.has_photo} className="size-11" />
        <div className="bk-item-body"><strong>{member.name || "Conta removida"}{mine ? " (você)" : ""}</strong><span>{member.email}</span>
          <span className="flex flex-wrap items-center gap-2"><Badge variant={member.available ? "secondary" : "destructive"}>{member.available ? "Disponível" : "Indisponível"}</Badge>
            <span className="text-sm text-muted-foreground">{availabilityNote(member)}</span></span>
          {mine && <span className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(async () => {
              await api.mutate(base + "/members/me/availability", "PUT", { unavailable: !member.unavailable }); await load();
            }, member.unavailable ? "Você voltou a ficar disponível." : "Você ficou indisponível até avisar que voltou.")}>{member.unavailable ? "Voltar a ficar disponível" : "Ficar indisponível"}</Button>
            <Button size="sm" variant="outline" disabled={busy} aria-pressed={member.automatic} onClick={() => void act(async () => {
              await api.mutate(base + "/members/me/availability", "PUT", { automatic: !member.automatic }); await load();
            }, member.automatic ? "Automático desligado: só vale o que você marcar." : "Automático ligado: você fica indisponível sozinho durante os atendimentos.")}>{member.automatic ? "Automático: ligado" : "Automático: desligado"}</Button>
          </span>}
          {mine && <span className="text-sm text-muted-foreground">{member.automatic ? "No automático você fica indisponível durante os atendimentos e volta sozinho quando terminam." : "Sem o automático, só vale o que você marcar aqui."}</span>}
        </div>
        {editable ? <div className="bk-member-actions">
          <NativeSelect aria-label={"Papel de " + member.name} value={member.role} disabled={busy} onChange={e => void act(async () => {
            await api.mutate(base + "/members/" + member.user_id, "PATCH", { role: e.target.value }); await load();
          }, "Papel atualizado.")}>
            {roles.map(role => <NativeSelectOption key={role} value={role}>{ROLE_LABELS[role]}</NativeSelectOption>)}
          </NativeSelect>
          <Button size="sm" variant="destructive" disabled={busy} onClick={() => { if (window.confirm(`Remover ${member.name} da equipe?`)) void act(async () => { await api.mutate(base + "/members/" + member.user_id, "DELETE"); await load(); }, "Pessoa removida."); }}>Remover</Button>
        </div> : <span className="bk-role" data-owner={member.role === "owner" || undefined}>{ROLE_LABELS[member.role]}</span>}
      </div>;
    })}</div>}
    {members && members.length === 1 && manages && <Empty><EmptyHeader><EmptyMedia variant="icon"><UserPlus /></EmptyMedia><EmptyTitle>Só você por enquanto</EmptyTitle><EmptyDescription>Convide quem trabalha com você. Cada pessoa entra com a própria conta e vê só o que o papel permite.</EmptyDescription></EmptyHeader></Empty>}
    {manages && roles.length > 0 && <Card><CardHeader><CardTitle>Convidar alguém</CardTitle><CardDescription>Quem receber entra com a própria conta Nexo Atendimentos, ou cria uma na hora, e já é cadastrado neste negócio. O convite vale por 7 dias.</CardDescription></CardHeader>
      <CardContent><form onSubmit={invite} className="flex flex-col gap-4">
        <FieldGroup>
          <Field><FieldLabel>Como enviar</FieldLabel>
            <ToggleGroup type="single" value={via} onValueChange={value => { if (value) setVia(value as "email" | "link"); }} aria-label="Como enviar o convite" className="bk-via">
              <ToggleGroupItem value="email"><Mail />Por e-mail</ToggleGroupItem>
              <ToggleGroupItem value="link"><Link2 />Por link</ToggleGroupItem>
            </ToggleGroup></Field>
          {via === "email"
            ? <TextField key="email" label="E-mail da pessoa" name="email" type="email" required autoComplete="off" help="Enviamos o convite para este e-mail. Só essa conta consegue aceitar." />
            : <p className="bk-muted" key="link">Vamos gerar um link para você copiar ou compartilhar (WhatsApp, por exemplo). Qualquer pessoa com o link pode aceitar, então envie só para quem você quer na equipe.</p>}
          <Field><FieldLabel htmlFor="bk-invite-role">O que ela pode fazer</FieldLabel>
            <NativeSelect id="bk-invite-role" name="role" defaultValue={roles.includes("staff") ? "staff" : roles[0]}>
              {roles.map(role => <NativeSelectOption key={role} value={role}>{ROLE_LABELS[role]}: {ROLE_HELP[role]}</NativeSelectOption>)}
            </NativeSelect></Field>
        </FieldGroup>
        <Button type="submit" className="self-start" disabled={busy}>{busy ? <Busy>Criando…</Busy> : via === "email" ? <><Mail data-icon="inline-start" />Enviar convite</> : <><Link2 data-icon="inline-start" />Gerar link</>}</Button>
      </form></CardContent></Card>}
    {manages && invitations.length > 0 && <div className="flex flex-col gap-3"><h2>Convites pendentes</h2><div className="bk-list">{invitations.map(invitation => <div className="bk-item" key={invitation.id} style={{ cursor: "default" }}>
      <div className="bk-item-body"><strong>{invitation.email || "Por link, qualquer pessoa"}</strong><span>{invitation.email ? "Por e-mail" : "Por link"} · {ROLE_LABELS[invitation.role]} · vale até {new Date(invitation.expires_at.endsWith("Z") ? invitation.expires_at : invitation.expires_at + "Z").toLocaleDateString("pt-BR")}</span></div>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(async () => { await api.mutate(base + "/invitations/" + invitation.id, "DELETE"); if (created?.id === invitation.id) setCreated(undefined); await load(); }, "Convite cancelado.")}>Cancelar</Button>
    </div>)}</div></div>}
    {business.my_role !== "owner" && <Button variant="outline" disabled={busy} onClick={() => { if (window.confirm(`Sair da equipe de ${business.name}?`)) void act(async () => { await api.mutate(base + "/members/" + me.id, "DELETE"); onLeft(); }); }}>Sair desta equipe</Button>}
  </section>;
}
