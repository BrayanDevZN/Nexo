import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, CalendarPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { message } from "@/admin/shared";
import type { BookingApi } from "./api";
import { disableNotifications, enableNotifications, notificationState, type NotificationState } from "./notifications";

/** The corner of the top bar: whether the schedule is live, and the switch for notifications of new bookings. */
export function LiveBar({ api, online }: { api: BookingApi; online: boolean }) {
  const [state, setState] = useState<NotificationState>(() => notificationState());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => { setState(notificationState()); }, []);
  useEffect(() => { if (!note) return; const timer = setTimeout(() => setNote(""), 6000); return () => clearTimeout(timer); }, [note]);
  if (state === "unsupported") return <div className="bk-live"><span className="bk-live-dot" data-on={online || undefined}>{online ? "Ao vivo" : "Reconectando"}</span></div>;
  async function toggle() {
    if (busy) return;
    setBusy(true); setNote("");
    try {
      if (state === "on") { await disableNotifications(api); setNote("Notificações desligadas."); }
      else { const mode = await enableNotifications(api); setNote(mode === "push" ? "Notificações ativas: você recebe um aviso a cada novo horário, mesmo com o app fechado." : "Notificações ativas enquanto o Atendimentos estiver aberto."); }
    } catch (error) { setNote(message(error)); }
    finally { setState(notificationState()); setBusy(false); }
  }
  const label = state === "on" ? "Desativar notificações de novos horários" : state === "blocked" ? "Notificações bloqueadas no navegador" : "Ativar notificações de novos horários";
  return <div className="bk-live">
    <span className="bk-live-dot" data-on={online || undefined} title={online ? "Agenda em tempo real" : "Reconectando ao tempo real"}>{online ? "Ao vivo" : "Reconectando"}</span>
    <Tooltip><TooltipTrigger asChild>
      <Button variant={state === "on" ? "secondary" : "outline"} size="sm" className="bk-bell" aria-label={label} aria-pressed={state === "on"} disabled={busy || state === "blocked"} onClick={() => void toggle()}>
        {state === "on" ? <BellRing data-icon="inline-start" /> : state === "blocked" ? <BellOff data-icon="inline-start" /> : <Bell data-icon="inline-start" />}
        <span>{state === "on" ? "Notificações ativas" : state === "blocked" ? "Bloqueadas" : "Ativar notificações"}</span>
      </Button>
    </TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
    {note && <p className="bk-live-note" role="status">{note}</p>}
  </div>;
}

export type Flash = { id: number; title: string; text: string };
/** A short notice at the corner of the screen when someone else books, changes or removes an appointment. */
export function LiveToast({ flash, onClose }: { flash?: Flash; onClose: () => void }) {
  useEffect(() => { if (!flash) return; const timer = setTimeout(onClose, 7000); return () => clearTimeout(timer); }, [flash?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!flash) return null;
  return <div className="bk-toast" role="status" aria-live="polite" key={flash.id}>
    <span className="bk-toast-icon"><CalendarPlus /></span>
    <p><strong>{flash.title}</strong><span>{flash.text}</span></p>
    <Button variant="ghost" size="icon-sm" aria-label="Fechar aviso" onClick={onClose}><X /></Button>
  </div>;
}
