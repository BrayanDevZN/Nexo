import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, CalendarCheck, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Feedback, FieldGroup, TextField, message, passwordValid } from "@/admin/shared";
import { useNTransition } from "./NTransition";
import { ROLE_LABELS, type BookingApi, type BookingUser, type InvitationInfo } from "./api";

type Mode = "login" | "register" | "verify" | "recovery" | "confirm";
type Props = { api: BookingApi; complete: boolean; invite?: InvitationInfo; onLogin: (user: BookingUser) => void };

export function GoogleLogo() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" data-icon="inline-start">
    <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z" />
    <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z" />
    <path fill="#FBBC05" d="M6.41 13.92a6 6 0 0 1 0-3.84V7.49H3.07a10 10 0 0 0 0 9.02l3.34-2.59Z" />
    <path fill="#EA4335" d="M12 5.96c1.47 0 2.79.5 3.83 1.51l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.93 5.49l3.34 2.59C7.2 7.72 9.4 5.96 12 5.96Z" />
  </svg>;
}

type ArtEvent = { col: number; from: number; to: number; who: string; hue: "violet" | "green" | "amber"; at?: string; hero?: boolean };
const ART_EVENTS: ArtEvent[] = [
  { col: 0, from: 0.02, to: 0.3, who: "Lucas A.", hue: "green" }, { col: 0, from: 0.46, to: 0.82, who: "Bruno T.", hue: "violet" },
  { col: 1, from: 0.16, to: 0.5, who: "Marcos V.", hue: "violet" }, { col: 1, from: 0.62, to: 0.86, who: "André L.", hue: "green" },
  { col: 2, from: 0.04, to: 0.28, who: "Felipe C.", hue: "green" }, { col: 2, from: 0.36, to: 0.66, who: "Diego Ramos", hue: "violet", at: "11:00", hero: true }, { col: 2, from: 0.74, to: 0.96, who: "Caio M.", hue: "violet" },
  { col: 3, from: 0.2, to: 0.46, who: "Pedro R.", hue: "violet" }, { col: 3, from: 0.56, to: 0.78, who: "João F.", hue: "amber" },
  { col: 4, from: 0.1, to: 0.42, who: "Thiago N.", hue: "violet" },
];
const ART_DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex"];
const ART_TEAM = [["RM", "violet"], ["CD", "green"], ["EP", "amber"]] as const;

/** The illustration beside the form: the product's own pieces (a week of the agenda, today's list, a booking arriving, the team) layered and gently floating. */
function AuthArt() {
  return <aside className="bk-auth-aside" aria-hidden="true">
    <p>Quem atende com hora marcada não deveria perder tempo com a agenda.</p>
    <div className="bk-art">
      <span className="bk-art-orb" />
      <div className="bk-art-cal">
        <header><strong>15 – 21 nov</strong><span>Semana</span><i>Hoje</i></header>
        <div className="bk-art-days">{ART_DAYS.map((day, index) => <span key={day} data-today={index === 2 || undefined}>{day}<b>{16 + index}</b></span>)}</div>
        <div className="bk-art-grid">
          {ART_DAYS.map((day, col) => <div key={day} className="bk-art-col" data-today={col === 2 || undefined}>
            {ART_EVENTS.filter(event => event.col === col).map(event => <span key={event.who} className="bk-art-ev" data-hue={event.hue} data-hero={event.hero || undefined} style={{ top: event.from * 100 + "%", height: (event.to - event.from) * 100 + "%" }}>
              <b>{event.who}</b>{event.at && <small>{event.at}</small>}
            </span>)}
          </div>)}
        </div>
      </div>
      <div className="bk-art-today">
        <header><strong>Hoje</strong><span>5 atendimentos</span></header>
        {[["09:00", "Lucas Almeida", "RM", "violet", true], ["11:00", "Diego Ramos", "CD", "green", false], ["13:30", "Felipe Costa", "EP", "amber", false]].map(([time, who, ini, hue, done]) => <div key={String(time)} className="bk-art-row" data-done={done || undefined}>
          <time>{time}</time><span className="bk-art-av" data-hue={hue}>{ini}</span><strong>{who}</strong>{done ? <Check /> : <i />}
        </div>)}
        <footer><span>Receita prevista</span><strong>R$ 270,00</strong></footer>
      </div>
      <div className="bk-art-toast"><span className="bk-art-ok"><CalendarCheck /></span><p><strong>Novo agendamento</strong><span>Diego Ramos · hoje, 11:00</span></p></div>
      <div className="bk-art-team"><span className="bk-art-stack">{ART_TEAM.map(([ini, hue]) => <span key={ini} className="bk-art-av" data-hue={hue}>{ini}</span>)}</span><p><strong>3 na equipe</strong><span>2 livres às 11:00</span></p></div>
      <div className="bk-art-stat"><span>Concluídos no mês</span><strong>31</strong><i><b /></i><small>60% do total</small></div>
    </div>
    <small>Ilustração com dados fictícios, só para mostrar como o app fica.</small>
  </aside>;
}

/** Sign-in, sign-up with an e-mail code, password recovery and the end of a Google sign-in. */
export function Auth({ api, complete, invite, onLogin }: Props) {
  const [mode, setMode] = useState<Mode>(invite ? "register" : "login");
  const [google, setGoogle] = useState<{ name: string; email: string; csrf_token: string }>();
  const [email, setEmail] = useState(invite?.email || "");
  const [registration, setRegistration] = useState<Record<string, string>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  // The invitation is read after the screen opens; its e-mail fills the field once, if nothing was typed.
  useEffect(() => { if (invite?.email) setEmail(current => current || invite.email!); }, [invite]);
  useEffect(() => {
    if (!complete) return;
    let active = true;
    api.request<typeof google>("/auth/google/profile").then(profile => { if (active) setGoogle(profile); })
      .catch(e => { if (active) setError(message(e)); });
    return () => { active = false; };
  }, [api, complete]);
  const { play, overlay } = useNTransition();
  // Each switch plays the short version of the N transition, and the new mode appears under it.
  function switchMode(next: Mode) { play(() => { setMode(next); setError(""); setSuccess(""); }, true); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    setBusy(true); setError(""); setSuccess("");
    try {
      if (complete) {
        if (!google) throw new Error("Recomece o acesso com Google.");
        onLogin(await api.mutate<BookingUser>("/auth/google/complete", "POST", { name: values.name, phone: values.phone || null }, google.csrf_token));
      } else if (mode === "login") {
        onLogin(await api.publicPost<BookingUser>("/auth/login", { email, password: values.password }));
      } else if (mode === "register") {
        if (!passwordValid(values.password)) throw new Error("A senha precisa de pelo menos 12 caracteres.");
        if (values.password !== values.confirm_password) throw new Error("As senhas não são iguais.");
        const data = { name: values.name, phone: values.phone, email, password: values.password };
        await api.publicPost("/auth/register", data);
        setRegistration(data); setMode("verify");
        setSuccess("Enviamos um código para o seu e-mail. Confira também o spam.");
      } else if (mode === "verify") {
        onLogin(await api.publicPost<BookingUser>("/auth/register/confirm", { email, code: values.code }));
      } else if (mode === "recovery") {
        await api.publicPost("/auth/password/recovery/request", { email });
        setMode("confirm"); setSuccess("Se este e-mail tem conta com senha, você vai receber um código.");
      } else {
        if (!passwordValid(values.password)) throw new Error("A senha precisa de pelo menos 12 caracteres.");
        await api.publicPost("/auth/password/recovery/confirm", { email, code: values.code, new_password: values.password });
        setMode("login"); setSuccess("Senha atualizada. Entre com a nova senha.");
      }
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  const title = complete ? "Complete seu cadastro" : { login: "Entrar", register: "Criar conta", verify: "Confirme seu e-mail", recovery: "Recuperar senha", confirm: "Nova senha" }[mode];
  const description = complete ? (google?.email || "Confirme seu nome para começar.")
    : { login: "Acesse a agenda do seu negócio.", register: "Leva um minuto. Depois é só cadastrar o negócio.", verify: `Digite o código de 8 números que chegou em ${email}.`, recovery: "Enviamos um código para o seu e-mail.", confirm: "Use o código recebido e escolha a nova senha." }[mode];
  const action = complete ? "Concluir" : { login: "Entrar", register: "Criar conta", verify: "Confirmar", recovery: "Enviar código", confirm: "Salvar senha" }[mode];
  return <main className="bk-auth">
    {overlay}
    <div className="bk-auth-main">
    <div className="bk-auth-head">
      <a href="/" aria-label="Nexo, voltar ao site"><img src="/images/nexo-symbol-purple.png" alt="" width="32" height="32" decoding="async" />Nexo Atendimentos</a>
      <h1>{complete ? "Falta pouco para começar" : mode === "register" ? "Crie sua conta" : "Entre na sua agenda"}</h1>
      <p>Horários, serviços e equipe do seu negócio em um só lugar, no celular ou no computador.</p>
    </div>
    {invite && <Feedback success={`Você foi convidado para ${invite.business_name} como ${ROLE_LABELS[invite.role].toLowerCase()}. Entre ou crie sua conta para aceitar.`} />}
    {/* Each mode (sign in, sign up, code, recovery) is a new element, so switching plays the entrance again. */}
    <div key={complete ? "google" : mode} className="bk-fade">
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Feedback error={error} success={success} />
        <form onSubmit={submit} key={complete ? "google" : mode} className="flex flex-col gap-4">
          <FieldGroup>
            {(complete || mode === "register") && <>
              <TextField label="Seu nome" name="name" autoComplete="name" defaultValue={google?.name || ""} required maxLength={120} />
              <TextField label="Celular" name="phone" type="tel" autoComplete="tel" placeholder="(11) 99999-9999" maxLength={30} minLength={complete ? undefined : 10} required={!complete} help={complete ? "Opcional." : undefined} />
            </>}
            {!complete && <TextField label="E-mail" name="email" type="email" autoComplete="email" required readOnly={mode === "verify" || (mode === "register" && !!invite?.email)} value={email} onChange={e => setEmail(e.target.value)} />}
            {(mode === "verify" || mode === "confirm") && !complete && <TextField label="Código" name="code" inputMode="numeric" pattern="[0-9]{8}" minLength={8} maxLength={8} autoComplete="one-time-code" required />}
            {!complete && (mode === "login" || mode === "register" || mode === "confirm") && <TextField label={mode === "login" ? "Senha" : "Nova senha"} name="password" type="password" required autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "login" ? undefined : 12} help={mode === "login" ? undefined : "Pelo menos 12 caracteres."} />}
            {!complete && mode === "register" && <TextField label="Repita a senha" name="confirm_password" type="password" autoComplete="new-password" minLength={12} required />}
          </FieldGroup>
          <Button type="submit" size="lg" disabled={busy || (complete && !google)}>
            {busy ? <><Spinner data-icon="inline-start" />Enviando…</> : <>{action}<ArrowRight data-icon="inline-end" /></>}
          </Button>
        </form>
        {!complete && (mode === "login" || mode === "register") && <>
          <div className="bk-or">ou</div>
          <Button variant="outline" size="lg" className="bk-google" asChild><a href={api.googleLogin}><GoogleLogo />Continuar com Google</a></Button>
        </>}
        {!complete && mode === "login" && <Button variant="link" disabled={busy} onClick={() => switchMode("recovery")}>Esqueci minha senha</Button>}
        {!complete && mode === "verify" && <Button variant="link" disabled={busy} onClick={async () => {
          if (!registration) return;
          setBusy(true); setError("");
          try { await api.publicPost("/auth/register", registration); setSuccess("Código reenviado. Confira seu e-mail."); }
          catch (e) { setError(message(e)); } finally { setBusy(false); }
        }}>Reenviar código</Button>}
        {complete && error && <Button variant="outline" asChild><a href={api.googleLogin}><GoogleLogo />Recomeçar com Google</a></Button>}
      </CardContent>
      {!complete && <CardFooter className="justify-center">
        <Button variant="link" disabled={busy} onClick={() => switchMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Ainda não tem conta? Criar conta" : "Já tem conta? Entrar"}</Button>
      </CardFooter>}
    </Card>
    </div>
    <p className="bk-auth-foot">Feito pela Nexo para quem atende com hora marcada.</p>
    </div>
    <AuthArt />
  </main>;
}
