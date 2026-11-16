import { useEffect, useState, type FormEvent } from "react";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Busy, Feedback, FieldGroup, TextField, message, passwordValid } from "@/admin/shared";
import { ROLE_LABELS, type BookingApi, type BookingUser, type InvitationInfo } from "./api";

type Mode = "login" | "register" | "verify" | "recovery" | "confirm";
type Props = { api: BookingApi; complete: boolean; invite?: InvitationInfo; onLogin: (user: BookingUser) => void };

/** Sign-in, sign-up with an e-mail code, password recovery and the end of a Google sign-in. One plain card. */
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
  function switchMode(next: Mode) { setMode(next); setError(""); setSuccess(""); }
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
  const action = complete ? "Concluir" : { login: "Entrar", register: "Criar conta", verify: "Confirmar", recovery: "Enviar código", confirm: "Salvar senha" }[mode];
  return <main className="bk-auth">
    <a href="/" aria-label="Nexo, voltar ao site"><Brand /></a>
    <div><h1>Nexo Atendimentos</h1><p className="bk-muted">Sua agenda, seus serviços e sua equipe em um só lugar.</p></div>
    {invite && <Feedback success={`Você foi convidado para ${invite.business_name} como ${ROLE_LABELS[invite.role].toLowerCase()}. Entre ou crie sua conta para aceitar.`} />}
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle>
        {complete && google && <CardDescription>{google.email}</CardDescription>}
        {mode === "verify" && <CardDescription>Digite o código de 8 números que chegou em {email}.</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Feedback error={error} success={success} />
        <form onSubmit={submit} key={complete ? "google" : mode} className="flex flex-col gap-4">
          <FieldGroup>
            {(complete || mode === "register") && <>
              <TextField label="Seu nome" name="name" autoComplete="name" defaultValue={google?.name || ""} required maxLength={120} />
              <TextField label="Celular" name="phone" type="tel" autoComplete="tel" placeholder="(11) 99999-9999" maxLength={30} minLength={complete ? undefined : 10} required={!complete} help={complete ? "Opcional." : undefined} />
            </>}
            {!complete && <TextField label="E-mail" name="email" type="email" autoComplete="email" required readOnly={mode === "verify"} value={email} onChange={e => setEmail(e.target.value)} />}
            {(mode === "verify" || mode === "confirm") && !complete && <TextField label="Código" name="code" inputMode="numeric" pattern="[0-9]{8}" minLength={8} maxLength={8} autoComplete="one-time-code" required />}
            {!complete && (mode === "login" || mode === "register" || mode === "confirm") && <TextField label={mode === "login" ? "Senha" : "Nova senha"} name="password" type="password" required autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "login" ? undefined : 12} help={mode === "login" ? undefined : "Pelo menos 12 caracteres."} />}
            {!complete && mode === "register" && <TextField label="Repita a senha" name="confirm_password" type="password" autoComplete="new-password" minLength={12} required />}
          </FieldGroup>
          <Button type="submit" size="lg" disabled={busy || (complete && !google)}>{busy ? <Busy>Enviando…</Busy> : action}</Button>
        </form>
        {!complete && (mode === "login" || mode === "register") && <Button variant="outline" size="lg" asChild><a href={api.googleLogin}>Continuar com Google</a></Button>}
        {!complete && mode === "login" && <Button variant="link" disabled={busy} onClick={() => switchMode("recovery")}>Esqueci minha senha</Button>}
        {!complete && mode === "verify" && <Button variant="link" disabled={busy} onClick={async () => {
          if (!registration) return;
          setBusy(true); setError("");
          try { await api.publicPost("/auth/register", registration); setSuccess("Código reenviado. Confira seu e-mail."); }
          catch (e) { setError(message(e)); } finally { setBusy(false); }
        }}>Reenviar código</Button>}
        {complete && error && <Button variant="outline" asChild><a href={api.googleLogin}>Recomeçar com Google</a></Button>}
      </CardContent>
      {!complete && <CardFooter className="justify-center">
        <Button variant="link" disabled={busy} onClick={() => switchMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Ainda não tem conta? Criar conta" : "Já tem conta? Entrar"}</Button>
      </CardFooter>}
    </Card>
  </main>;
}
