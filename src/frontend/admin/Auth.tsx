import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { type createApi, type GoogleProfile, type User } from "./api";
import { PhotoPicker } from "./PhotoPicker";
import { Busy, Feedback, FieldGroup, TextField, message, passwordValid } from "./shared";

type Props = { api: ReturnType<typeof createApi>; complete: boolean; onLogin: (user: User) => void };
type Mode = "login" | "register" | "recovery" | "confirm" | "verify";
function GoogleLogo() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" data-icon="inline-start">
    <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z" />
    <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z" />
    <path fill="#FBBC05" d="M6.41 13.92a6 6 0 0 1 0-3.84V7.49H3.07a10 10 0 0 0 0 9.02l3.34-2.59Z" />
    <path fill="#EA4335" d="M12 5.96c1.47 0 2.79.5 3.83 1.51l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.93 5.49l3.34 2.59C7.2 7.72 9.4 5.96 12 5.96Z" />
  </svg>;
}
export function Auth({ api, complete, onLogin }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [createdUser, setCreatedUser] = useState<User>();
  const [selectedPhoto, setSelectedPhoto] = useState<File>();
  const [registration, setRegistration] = useState<Record<string, string>>();
  const [google, setGoogle] = useState<GoogleProfile>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [email, setEmail] = useState("");
  useEffect(() => {
    if (complete) {
      let active = true;
      api.request<GoogleProfile>("/auth/google/profile").then(profile => { if (active) setGoogle(profile); })
        .catch(e => { if (active) setError(message(e)); });
      return () => { active = false; };
    }
  }, [api, complete]);
  function switchMode(next: Mode) { setMode(next); setRegistration(undefined); setError(""); setSuccess(""); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const values = Object.fromEntries(data) as Record<string, string>;
    setBusy(true); setError(""); setSuccess("");
    try {
      if (complete) {
        if (!google) throw new Error("Reinicie o acesso com Google para completar seu perfil.");
        const user = await api.mutate<User>("/auth/google/complete", "POST", { name: values.name, phone: values.phone }, google.csrf_token);
        setCreatedUser(user);
      } else if (mode === "login") {
        onLogin(await api.publicPost<User>("/auth/login", { email, password: values.password }));
      } else if (mode === "register") {
        if (!passwordValid(values.password)) throw new Error("Use pelo menos 12 caracteres e até 72 bytes na senha.");
        if (values.password !== values.confirm_password) throw new Error("As senhas não coincidem.");
        await api.publicPost("/auth/register", { name: values.name, phone: values.phone, email, password: values.password });
        setRegistration({ name: values.name, phone: values.phone, email, password: values.password });
        setMode("verify"); setSuccess("Enviamos um código para seu e-mail. Confirme para criar sua conta. Confira também o spam.");
      } else if (mode === "verify") {
        setCreatedUser(await api.publicPost<User>("/auth/register/confirm", { email, code: values.code }));
        setRegistration(undefined); setSuccess("");
      } else if (mode === "recovery") {
        await api.publicPost("/auth/password/recovery/request", { email });
        setMode("confirm"); setSuccess("Se este e-mail tem uma conta com senha, você receberá um código. Confira também o spam.");
      } else {
        if (!passwordValid(values.password)) throw new Error("Use pelo menos 12 caracteres e até 72 bytes na senha.");
        await api.publicPost("/auth/password/recovery/confirm", { email, code: values.code, new_password: values.password });
        setMode("login"); setSuccess("Senha atualizada. Entre com sua nova senha.");
      }
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  if (createdUser) return <main className="admin-auth">
    <section className="admin-intro"><a href="/" aria-label="Nexo, voltar ao site"><Brand /></a><div><span className="admin-eyebrow">QUASE PRONTO</span><h1>Um perfil<br />com a sua cara.</h1><p>Sua conta foi criada. Escolha uma foto ou deixe para depois.</p></div></section>
    <Card className="admin-auth-card"><CardHeader><CardTitle>Adicione sua foto de perfil</CardTitle><CardDescription>Esta etapa é opcional. Você também pode adicionar ou trocar sua foto no painel.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-5"><Feedback error={error} />
        <form className="flex flex-col gap-5" onSubmit={async event => {
          event.preventDefault(); if (busy || !selectedPhoto) return;
          const data = new FormData(event.currentTarget); setBusy(true); setError("");
          try { onLogin(await api.mutate<User>("/auth/profile/photo", "PUT", data)); }
          catch (e) { setError(message(e)); } finally { setBusy(false); }
        }}><FieldGroup><PhotoPicker disabled={busy} onSelect={setSelectedPhoto} /></FieldGroup>
          <Button type="submit" size="lg" disabled={busy || !selectedPhoto}>{busy ? <Busy>Enviando…</Busy> : "Salvar foto e continuar"}</Button>
        </form>
      </CardContent><CardFooter><Button type="button" variant="ghost" disabled={busy} onClick={() => onLogin(createdUser)}>Pular por enquanto<ArrowRight data-icon="inline-end" /></Button></CardFooter>
    </Card></main>;
  const title = complete ? "Complete seu perfil" : ({ login: "Bem-vindo de volta", register: "Crie sua conta", recovery: "Recupere seu acesso", confirm: "Defina uma nova senha", verify: "Confirme seu e-mail" })[mode];
  return <main className="admin-auth">
    <section className="admin-intro">
      <a href="/" aria-label="Nexo, voltar ao site"><Brand /></a>
      <div><span className="admin-eyebrow">ESPAÇO NEXO</span><h1>Seu próximo<br />passo, conectado.</h1>
        <p>Organize os contatos, acompanhe os contratos e mantenha a equipe na mesma página.</p></div>
      <p className="flex items-center gap-2"><ShieldCheck className="size-5" /> Acesso liberado pelo administrador.</p>
    </section>
    <Card className="admin-auth-card">
      <CardHeader><CardTitle>{title}</CardTitle><CardDescription>{complete ? "Confirme seu nome e celular para solicitar acesso." : mode === "register" ? "Sua conta será analisada antes de acessar os dados." : "Acesse o painel administrativo da Nexo."}</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Feedback error={error} success={success} />
        <form onSubmit={submit} key={complete ? "google" : mode} className="flex flex-col gap-5">
          <FieldGroup>
            {(complete || mode === "register") && <>
              <TextField label="Nome completo" name="name" autoComplete="name" defaultValue={google?.name || ""} required maxLength={120} />
              <TextField label="Celular" name="phone" type="tel" autoComplete="tel" placeholder="(31) 99999-9999" minLength={10} maxLength={30} required />
            </>}
            {!complete && <TextField label="E-mail" name="email" type="email" autoComplete="email" required readOnly={mode === "verify"} value={email} onChange={e => setEmail(e.target.value)} />}
            {complete && google && <p className="text-sm text-muted-foreground">{google.email}</p>}
            {(mode === "confirm" || mode === "verify") && !complete && <TextField label="Código recebido por e-mail" name="code" inputMode="numeric" pattern="[0-9]{8}" minLength={8} maxLength={8} autoComplete="one-time-code" required />}
            {!complete && mode !== "recovery" && mode !== "verify" && <TextField label={mode === "login" ? "Senha" : "Nova senha"} name="password" type="password" required
              autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "login" ? undefined : 12}
              help={mode === "login" ? undefined : "Pelo menos 12 caracteres. Use uma senha exclusiva."} />}
            {!complete && mode === "register" && <TextField label="Confirmar senha" name="confirm_password" type="password" autoComplete="new-password" minLength={12} required />}
          </FieldGroup>
          <Button type="submit" size="lg" disabled={busy || (complete && !google)}>
            {busy ? <Busy>Enviando…</Busy> : <>{complete ? "Solicitar acesso" : mode === "login" ? "Entrar no painel" : mode === "register" ? "Criar conta" : mode === "verify" ? "Confirmar cadastro" : mode === "recovery" ? "Enviar código" : "Atualizar senha"}<ArrowRight data-icon="inline-end" /></>}
          </Button>
        </form>
        {!complete && (mode === "login" || mode === "register") && <>
          <Separator />
          <Button variant="outline" size="lg" asChild><a href={api.googleLogin}><GoogleLogo />Continuar com Google</a></Button>
          {mode === "login" && <Button variant="link" onClick={() => switchMode("recovery")}>Esqueci minha senha</Button>}
        </>}
        {!complete && mode === "confirm" && <Button variant="link" disabled={busy} onClick={() => switchMode("recovery")}>Solicitar outro código</Button>}
        {!complete && mode === "verify" && <Button variant="link" disabled={busy} onClick={async () => {
          if (!registration || busy) return;
          setBusy(true); setError("");
          try { await api.publicPost("/auth/register", registration); setSuccess("Código solicitado. Aguarde o intervalo de reenvio e confira seu e-mail."); }
          catch (e) { setError(message(e)); } finally { setBusy(false); }
        }}>Reenviar código de cadastro</Button>}
        {complete && error && <Button variant="outline" asChild><a href={api.googleLogin}>Reiniciar com Google</a></Button>}
      </CardContent>
      <CardFooter className="flex flex-wrap justify-center gap-2">
        {!complete && <Button variant="link" disabled={busy} onClick={() => switchMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "Ainda não tem conta? Cadastre-se" : "Voltar para o login"}
        </Button>}
        <Button variant="ghost" asChild><a href="/"><ArrowLeft data-icon="inline-start" /> Voltar ao site</a></Button>
      </CardFooter>
    </Card>
  </main>;
}
