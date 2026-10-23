import { ArrowRight, Briefcase, House, LogOut, ShieldCheck, TerminalSquare } from "lucide-react";
import { Brand } from "@/components/Brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

/** Entry screen: each person only sees the areas their role allows. */
export function AreaGateway({ user, areas, loggingOut, onPick, onLogout }: {
  user: User; areas: Area[]; loggingOut: boolean; onPick: (area: Area) => void; onLogout: () => void;
}) {
  return <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col justify-center gap-8 px-4 py-10">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <a href="/" aria-label="Nexo, voltar ao site"><Brand /></a>
      <div className="flex items-center gap-2">
        <Badge variant="outline"><ShieldCheck className="size-3" />{ROLE_LABELS[user.role]}</Badge>
        <Button variant="ghost" disabled={loggingOut} onClick={onLogout}><LogOut data-icon="inline-start" /> Sair</Button>
      </div>
    </div>
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Olá, {user.name.split(" ")[0]}.</h1>
      <p className="mt-2 text-muted-foreground">Escolha a área que você quer acessar agora.</p>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {areas.map(area => {
        const item = AREAS[area];
        return <button key={area} type="button" onClick={() => onPick(area)} aria-label={`Entrar na área ${item.label}`}
          className="group text-left outline-none">
          <Card className="h-full transition-shadow group-hover:shadow-lg group-focus-visible:ring-2 group-focus-visible:ring-primary">
            <CardHeader>
              <item.icon className="size-9 text-primary" aria-hidden="true" />
              <CardTitle className="text-xl">{item.label}</CardTitle>
              <CardDescription>{item.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">{item.items}.</p>
              <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">Entrar <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden="true" /></span>
            </CardContent>
          </Card>
        </button>;
      })}
    </div>
  </main>;
}
