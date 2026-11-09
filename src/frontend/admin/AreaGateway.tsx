import { ArrowRight, Briefcase, House, Lock, LogOut, ShieldCheck, TerminalSquare } from "lucide-react";
import { Brand } from "@/components/Brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Letters, rings } from "@/components/rp/Intro";
import { ROLE_LABELS, type User } from "./api";

export type Area = "general" | "commercial" | "dev";

export const AREAS: Record<Area, { label: string; description: string; items: string; icon: typeof Briefcase }> = {
  general: {
    label: "Geral", icon: House,
    description: "O espaço de toda a equipe.",
    items: "Início, Documentos, Chat, Avisos, Membros e Meu perfil",
  },
  commercial: {
    label: "Comercial", icon: Briefcase,
    description: "Prospecção, relacionamento e vendas.",
    items: "Início, Dashboard do negócio, Funil, Clientes, Maps e Chaves",
  },
  dev: {
    label: "Desenvolvimento", icon: TerminalSquare,
    description: "Automações, integrações e infraestrutura.",
    items: "Automações, chaves de API e Bancos de dados",
  },
};

const ALL_AREAS: Area[] = ["general", "commercial", "dev"];

/**
 * Entry screen after the sign-in, in the style of the site's opening: the name written letter by letter, the three
 * interlocked rings drawing themselves, and one round button per area. Every area is listed; the ones the role may
 * not enter are shown locked.
 */
export function AreaGateway({ user, areas, loggingOut, onPick, onLogout }: {
  user: User; areas: Area[]; loggingOut: boolean; onPick: (area: Area) => void; onLogout: () => void;
}) {
  return <main className="rp-gateway" aria-label="Escolha a área">
    <div className="rp-gateway-top">
      <a href="/" aria-label="Nexo, voltar ao site"><Brand /></a>
      <div className="flex items-center gap-2">
        <Badge variant="outline"><ShieldCheck className="size-3" />{ROLE_LABELS[user.role]}</Badge>
        <Button variant="ghost" disabled={loggingOut} onClick={onLogout}><LogOut data-icon="inline-start" /> Sair</Button>
      </div>
    </div>
    <div className="rp-gateway-box">
      <p className="rp-intro-line"><Letters text="NEXO" delay={0.2} /></p>
      <svg className="rp-gateway-logo" viewBox="-120 -70 240 140" aria-hidden="true">
        {rings.map(([x, y], set) => [52, 43, 34].map((radius, index) => (
          <circle key={`${set}-${radius}`} cx={x} cy={y} r={radius} pathLength={1} className="rp-ring" style={{ animationDelay: `${0.5 + set * 0.35 + index * 0.18}s` }} />
        )))}
      </svg>
      <div className="rp-gateway-text">
        <h1 className="rp-gateway-title">Olá, {user.name.split(" ")[0]}.</h1>
        <p>Escolha a área que você quer acessar. As áreas com cadeado não estão liberadas para o seu cargo.</p>
      </div>
      <div className="rp-gateway-areas">
        {ALL_AREAS.map((area, index) => {
          const item = AREAS[area];
          const delay = { animationDelay: `${1.6 + index * 0.2}s` };
          if (!areas.includes(area)) {
            return <div key={area} className="rp-area rp-area-locked" aria-disabled="true" aria-label={`Área ${item.label}: sem acesso para o seu cargo`} style={delay}>
              <div className="rp-area-disc" aria-hidden="true">
                <svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="98" /><circle cx="100" cy="100" r="80" /></svg>
                <Lock />
              </div>
              <h2 className="rp-area-name">{item.label}</h2>
              <p className="rp-area-desc">{item.description}</p>
              <Badge variant="secondary" className="w-fit"><Lock data-icon="inline-start" /> Sem acesso</Badge>
              <p className="rp-area-items">O seu cargo não libera esta área. Fale com um administrador se precisar de acesso.</p>
            </div>;
          }
          return <div key={area} className="rp-area" style={delay}>
            <button type="button" className="rp-area-disc" onClick={() => onPick(area)} aria-label={`Entrar na área ${item.label}`}>
              <svg viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="98" /><circle cx="100" cy="100" r="80" /></svg>
              <item.icon aria-hidden="true" />
              <span>Entrar <ArrowRight aria-hidden="true" /></span>
            </button>
            <h2 className="rp-area-name">{item.label}</h2>
            <p className="rp-area-desc">{item.description}</p>
            <p className="rp-area-items">{item.items}.</p>
          </div>;
        })}
      </div>
    </div>
  </main>;
}
