import { useEffect, useState, type FormEvent } from "react";
import { Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { DeleteAccount } from "./DeleteAccount";
import { PhotoPicker } from "./PhotoPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ApiKey, type createApi, type CreatedApiKey, type User } from "./api";
import { Busy, Feedback, FieldGroup, TextField, message, passwordValid } from "./shared";

export function Profile({ api, user, onUpdate, onLoggedOut }: {
  api: ReturnType<typeof createApi>; user: User; onUpdate: (user: User) => void; onLoggedOut: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [photoVersion, setPhotoVersion] = useState(0);
  const [photoSource, setPhotoSource] = useState("");
  const [photoFailed, setPhotoFailed] = useState(false);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [apiKeyName, setApiKeyName] = useState("Minha integração");
  const [createdApiKey, setCreatedApiKey] = useState<CreatedApiKey | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let active = true;
    let url = "";
    setPhotoSource(""); setPhotoFailed(false);
    if (user.profile_photo) void api.photo().then(blob => {
      if (!active) return;
      url = URL.createObjectURL(blob); setPhotoSource(url);
    }).catch(() => { if (active) setPhotoFailed(true); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [api, user.id, user.profile_photo, photoVersion]);
  useEffect(() => {
    if (user.status !== "approved") return;
    void api.request<ApiKey[]>("/auth/api-keys").then(setApiKeys).catch(() => undefined);
  }, [api, user.status]);
  async function action(run: () => Promise<void>, text: string) {
    setBusy(true); setError(""); setSuccess("");
    try { await run(); setSuccess(text); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void action(async () => onUpdate(await api.mutate<User>("/auth/profile", "PUT", Object.fromEntries(data))), "Perfil atualizado.");
  }
  function upload(file: File | undefined) {
    if (!file || busy) return;
    const data = new FormData(); data.set("file", file);
    void action(async () => {
      onUpdate(await api.mutate<User>("/auth/profile/photo", "PUT", data));
      setPhotoVersion(v => v + 1); setPhotoFailed(false);
    }, "Foto atualizada.");
  }
  async function createApiKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || user.status !== "approved") return;
    setBusy(true); setError(""); setSuccess(""); setCreatedApiKey(null); setCopied(false);
    try {
      const created = await api.mutate<CreatedApiKey>("/auth/api-keys", "POST", { name: apiKeyName.trim() });
      setCreatedApiKey(created); setApiKeys(keys => [created, ...keys]); setSuccess("Chave criada. Copie-a agora, pois ela não será exibida novamente.");
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  async function revokeApiKey(id: string) {
    if (busy) return;
    setBusy(true); setError(""); setSuccess("");
    try { await api.mutate("/auth/api-keys/" + id, "DELETE"); setApiKeys(keys => keys.filter(key => key.id !== id)); setSuccess("Chave revogada."); }
    catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  async function copyApiKey() {
    if (!createdApiKey) return;
    await navigator.clipboard.writeText(createdApiKey.key);
    setCopied(true);
  }
  function password(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const values = Object.fromEntries(data) as Record<string, string>;
    void action(async () => {
      if (!passwordValid(values.new_password)) throw new Error("A senha precisa de pelo menos 12 caracteres e até 72 bytes.");
      if (values.new_password !== values.confirm) throw new Error("As novas senhas não coincidem.");
      await api.mutate("/auth/password/change", "POST", { current_password: values.current_password, new_password: values.new_password });
      onLoggedOut();
    }, "Senha atualizada. Entre novamente.");
  }
  return <section className="flex flex-col gap-6">
    <div className="admin-section-head"><div><span className="admin-eyebrow">SUA CONTA</span><h1>Perfil e segurança</h1><p>Mantenha seus dados atualizados.</p></div></div>
    <Feedback error={error} success={success} />
    <div className="admin-profile-grid">
      <Card><CardHeader><CardTitle>Seus dados</CardTitle><CardDescription>{user.email}</CardDescription></CardHeader>
        <CardContent><form onSubmit={save} className="flex flex-col gap-5"><FieldGroup>
          <TextField label="Nome completo" name="name" autoComplete="name" defaultValue={user.name} maxLength={120} required />
          <TextField label="Celular" name="phone" type="tel" autoComplete="tel" defaultValue={user.phone || ""} minLength={10} maxLength={30} required />
        </FieldGroup><Button disabled={busy} type="submit">{busy ? <Busy /> : "Salvar perfil"}</Button></form></CardContent>
      </Card>
      <Card><CardHeader><CardTitle>Foto de perfil</CardTitle><CardDescription>JPEG, PNG ou WebP estático. Até 2 MB no limite padrão.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-5">
          <FieldGroup><PhotoPicker key={photoVersion} source={photoFailed ? "" : photoSource} alt={"Foto de " + user.name} disabled={busy} onSelect={upload} /></FieldGroup>
          {busy && <Busy>Salvando…</Busy>}
          {user.profile_photo && <Button variant="outline" disabled={busy} onClick={() => void action(async () => {
            await api.mutate("/auth/profile/photo", "DELETE"); onUpdate({ ...user, profile_photo: null }); setPhotoFailed(false);
          }, "Foto removida.")}>Remover foto</Button>}
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle>Alterar senha</CardTitle><CardDescription>Para contas com senha local. Após a alteração, entre novamente.</CardDescription></CardHeader>
        <CardContent><form onSubmit={password} className="flex flex-col gap-5"><FieldGroup>
          <TextField label="Senha atual" name="current_password" type="password" autoComplete="current-password" required />
          <TextField label="Nova senha" name="new_password" type="password" autoComplete="new-password" minLength={12} required help="Pelo menos 12 caracteres." />
          <TextField label="Confirmar nova senha" name="confirm" type="password" autoComplete="new-password" minLength={12} required />
        </FieldGroup><Button type="submit" disabled={busy}>Atualizar senha</Button></form></CardContent>
      </Card>
      <Card><CardHeader><CardTitle>Acesso à Nexo</CardTitle><CardDescription>O e-mail e as permissões são gerenciados pelo administrador.</CardDescription></CardHeader><CardContent><p className="text-sm text-muted-foreground">Contas criadas com Google continuam usando o Google. A alteração acima exige uma senha local já cadastrada.</p></CardContent></Card>
      {user.status === "approved" && <Card className="md:col-span-2"><CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="size-5" /> Chaves de API</CardTitle><CardDescription>Use uma chave no header <code>Authorization: Bearer SUA_CHAVE</code> para consumir clientes, documentos e dashboards sem cookie. A chave completa aparece somente uma vez.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-5">
          <form onSubmit={createApiKey} className="flex flex-col gap-3 sm:flex-row sm:items-end"><TextField label="Nome da chave" value={apiKeyName} onChange={event => setApiKeyName(event.target.value)} maxLength={80} required /><Button type="submit" disabled={busy || !apiKeyName.trim()}>{busy ? <Busy /> : <><KeyRound data-icon="inline-start" /> Criar chave</>}</Button></form>
          {createdApiKey && <div className="flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-50 p-4 dark:bg-amber-950/20"><p className="text-sm font-medium">Copie esta chave agora. Por segurança, ela não será mostrada novamente.</p><div className="flex items-center gap-2"><code className="min-w-0 flex-1 overflow-x-auto rounded bg-background px-3 py-2 text-xs">{createdApiKey.key}</code><Button type="button" variant="outline" size="icon" onClick={() => void copyApiKey()} aria-label="Copiar chave API">{copied ? <Check /> : <Copy />}</Button></div></div>}
          {apiKeys.length > 0 ? <div className="flex flex-col gap-2">{apiKeys.map(key => <div key={key.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><p className="font-medium">{key.name}</p><p className="text-xs text-muted-foreground"><code>{key.key_prefix}••••••••</code> · criada em {new Date(key.created_at).toLocaleDateString("pt-BR")}{key.last_used_at ? " · usada por último em " + new Date(key.last_used_at).toLocaleDateString("pt-BR") : " · ainda não usada"}</p></div><Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => void revokeApiKey(key.id)}><Trash2 data-icon="inline-start" /> Revogar</Button></div>)}</div> : <p className="text-sm text-muted-foreground">Nenhuma chave ativa.</p>}
        </CardContent>
      </Card>}
      <DeleteAccount api={api} onDeleted={onLoggedOut} />
    </div>
  </section>;
}
