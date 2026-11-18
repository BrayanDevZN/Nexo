import { Clock, LogOut, ShieldOff, TimerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BookingUser } from "./api";

/** What someone sees while they have an account but no permission to use the product. It updates itself when the team decides. */
export function AccessGate({ user, online, onSignOut }: { user: BookingUser; online: boolean; onSignOut: () => void }) {
  const ended = user.access_expires_at ? new Date(user.access_expires_at.endsWith("Z") ? user.access_expires_at : user.access_expires_at + "Z").toLocaleDateString("pt-BR") : "";
  const copy = {
    pending: { icon: Clock, title: "Aguardando liberação", text: "Sua conta foi criada. Para usar o Atendimentos, a equipe da Nexo precisa liberar o seu acesso. Esta tela atualiza sozinha assim que isso acontecer, e você também recebe um e-mail." },
    rejected: { icon: ShieldOff, title: "Seu acesso foi removido", text: "A equipe da Nexo removeu o seu acesso ao Atendimentos. Se você acha que foi um engano, fale com a equipe." },
    expired: { icon: TimerOff, title: "Seu acesso expirou", text: `O seu acesso${ended ? " terminou em " + ended : " terminou"}. Peça um novo link ou a renovação para a equipe da Nexo. Seus dados continuam guardados.` },
    approved: { icon: Clock, title: "Acesso liberado", text: "Abrindo o Atendimentos…" },
  }[user.access_status];
  return <main className="bk-picker">
    <div className="bk-picker-bar"><a href="/" aria-label="Nexo, voltar ao site"><img src="/images/nexo-symbol-purple.png" alt="" width="28" height="28" />Nexo Atendimentos</a>
      <Button variant="ghost" size="sm" onClick={onSignOut}><LogOut data-icon="inline-start" />Sair</Button></div>
    <div className="bk-picker-sheet bk-gate" role="status" aria-live="polite">
      <span className="bk-gate-icon" data-state={user.access_status}><copy.icon aria-hidden="true" /></span>
      <h1>{copy.title}</h1>
      <p>{copy.text}</p>
      <p className="bk-gate-account"><strong>{user.name}</strong><span>{user.email}</span></p>
      <span className="bk-live-dot" data-on={online || undefined}>{online ? "Atualiza sozinha" : "Reconectando"}</span>
    </div>
  </main>;
}
