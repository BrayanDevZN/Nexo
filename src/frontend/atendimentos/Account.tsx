import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Busy, Feedback, FieldGroup, TextField, message, passwordValid } from "@/admin/shared";
import type { BookingApi, BookingUser } from "./api";
import { PanelLink } from "./PanelLink";
import { PhotoField } from "./Photo";

export function Account({ api, user, onUpdate, onLoggedOut }: { api: BookingApi; user: BookingUser; onUpdate: (user: BookingUser) => void; onLoggedOut: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function act(run: () => Promise<void>, text: string) {
    if (busy) return;
    setBusy(true); setError(""); setSuccess("");
    try { await run(); setSuccess(text); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    void act(async () => onUpdate(await api.mutate<BookingUser>("/auth/profile", "PUT", { name: values.name, phone: values.phone || null })), "Dados salvos.");
  }
  function password(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    void act(async () => {
      if (!passwordValid(values.new_password)) throw new Error("A senha precisa de pelo menos 12 caracteres.");
      if (values.new_password !== values.confirm) throw new Error("As senhas não são iguais.");
      await api.mutate("/auth/password/change", "POST", { current_password: values.current_password, new_password: values.new_password });
      onLoggedOut();
    }, "Senha atualizada. Entre de novo.");
  }
  return <section className="flex flex-col gap-4">
    <h1>Minha conta</h1>
    <Feedback error={error} success={success} />
    <Card><CardHeader><CardTitle>Seus dados</CardTitle><CardDescription>{user.email}</CardDescription></CardHeader>
      <CardContent><form onSubmit={save} className="flex flex-col gap-4"><FieldGroup>
        <PhotoField api={api} path="/auth/profile/photo" name={user.name} hasPhoto={user.has_photo} disabled={busy} onChanged={hasPhoto => onUpdate({ ...user, has_photo: hasPhoto })} label="Sua foto" />
        <TextField label="Nome" name="name" autoComplete="name" defaultValue={user.name} maxLength={120} required />
        <TextField label="Celular" name="phone" type="tel" autoComplete="tel" defaultValue={user.phone || ""} maxLength={30} />
      </FieldGroup><Button type="submit" disabled={busy}>{busy ? <Busy /> : "Salvar"}</Button></form></CardContent></Card>
    <Card><CardHeader><CardTitle>Trocar senha</CardTitle><CardDescription>Só para contas com senha. Quem entra com Google não precisa.</CardDescription></CardHeader>
      <CardContent><form onSubmit={password} className="flex flex-col gap-4"><FieldGroup>
        <TextField label="Senha atual" name="current_password" type="password" autoComplete="current-password" required />
        <TextField label="Nova senha" name="new_password" type="password" autoComplete="new-password" minLength={12} required help="Pelo menos 12 caracteres." />
        <TextField label="Repita a nova senha" name="confirm" type="password" autoComplete="new-password" minLength={12} required />
      </FieldGroup><Button type="submit" variant="outline" disabled={busy}>Atualizar senha</Button></form></CardContent></Card>
    <PanelLink api={api} />
    <Button variant="outline" disabled={busy} onClick={() => void act(async () => { await api.mutate("/auth/logout", "POST"); onLoggedOut(); }, "")}>Sair</Button>
  </section>;
}
