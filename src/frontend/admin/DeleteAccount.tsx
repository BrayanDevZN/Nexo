import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type createApi } from "./api";
import { Busy, Feedback, FieldGroup, TextField, message } from "./shared";

export function DeleteAccount({ api, onDeleted }: { api: ReturnType<typeof createApi>; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function requestCode() {
    if (busy) return;
    setBusy(true); setError("");
    try { await api.mutate("/auth/account/deletion/request", "POST"); setSent(true); }
    catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const code = String(new FormData(event.currentTarget).get("code") || "");
    setBusy(true); setError("");
    try { await api.mutate("/auth/account/deletion/confirm", "POST", { code }); onDeleted(); }
    catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  return <Card><CardHeader><CardTitle>Excluir conta</CardTitle><CardDescription>A exclusão é definitiva e exige um código enviado ao seu e-mail. Os clientes cadastrados serão preservados. A conta do admin principal é protegida.</CardDescription></CardHeader><CardContent>
    <Button variant="destructive" onClick={() => { setOpen(true); setSent(false); setError(""); }}><Trash2 data-icon="inline-start" /> Apagar minha conta</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><DialogContent showCloseButton={!busy}><DialogHeader><DialogTitle>Apagar sua conta?</DialogTitle><DialogDescription>{sent ? "Enviamos um código ao e-mail da sua conta. Digite-o para confirmar a exclusão definitiva." : "Você perderá o acesso ao painel. Primeiro, confirme sua identidade pelo e-mail da sua conta."}</DialogDescription></DialogHeader>
      <Feedback error={error} />
      {sent ? <form onSubmit={confirm} className="flex flex-col gap-5"><FieldGroup><TextField label="Código de exclusão recebido por e-mail" name="code" inputMode="numeric" pattern="[0-9]{8}" minLength={8} maxLength={8} autoComplete="one-time-code" required /></FieldGroup><Button variant="link" type="button" disabled={busy} onClick={() => void requestCode()}>Reenviar código de exclusão</Button><DialogFooter><Button variant="outline" type="button" disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button><Button variant="destructive" type="submit" disabled={busy}>{busy ? <Busy /> : "Confirmar exclusão da minha conta"}</Button></DialogFooter></form> : <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button><Button variant="destructive" disabled={busy} onClick={() => void requestCode()}>{busy ? <Busy /> : "Enviar código de exclusão"}</Button></DialogFooter>}
    </DialogContent></Dialog>
  </CardContent></Card>;
}
