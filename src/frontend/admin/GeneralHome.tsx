import { Briefcase, FileText, Megaphone, MessageCircle, TerminalSquare, UserRound, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { solutions, steps } from "@/lib/content";
import { ROLE_LABELS, type createApi, type User } from "./api";
import { MemberPhoto } from "./MemberPhoto";

export type GeneralPage = "documents" | "chat" | "announcements" | "directory" | "profile";

const SHORTCUTS: { page: GeneralPage; label: string; description: string; icon: typeof FileText }[] = [
  { page: "documents", label: "Documentos", description: "Arquivos compartilhados pela equipe.", icon: FileText },
  { page: "chat", label: "Chat", description: "Conversas privadas com os membros.", icon: MessageCircle },
  { page: "announcements", label: "Avisos", description: "Comunicados e novidades da Nexo.", icon: Megaphone },
  { page: "directory", label: "Membros", description: "Quem faz parte da equipe.", icon: Users },
  { page: "profile", label: "Meu perfil", description: "Seus dados, foto e senha.", icon: UserRound },
];

/** General start page: what Nexo is and how the panel is organized. It never shows data from the other areas. */
export function GeneralHome({ api, user, onOpen }: { api: ReturnType<typeof createApi>; user: User; onOpen: (page: GeneralPage) => void }) {
  return <section className="flex flex-col gap-6" aria-labelledby="general-home-title">
    <div className="admin-section-head"><div><span className="admin-eyebrow">GERAL</span><h1 id="general-home-title">Início</h1><p>Conheça a Nexo e como o painel está organizado.</p></div></div>

    <Card className="overflow-hidden"><CardContent className="flex flex-wrap items-center justify-between gap-5 p-6">
      <div className="flex items-center gap-4"><MemberPhoto api={api} id={user.id} name={user.name} hasPhoto={!!user.profile_photo} />
        <div><p className="text-sm text-muted-foreground">Bem-vindo à Nexo</p><h2 className="text-2xl font-semibold tracking-tight">Olá, {user.name.split(" ")[0]}!</h2>
          <p className="mt-1 text-sm text-muted-foreground">Este é o espaço de toda a equipe.</p></div></div>
      <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
    </CardContent></Card>

    <Card><CardHeader><CardTitle>A Nexo</CardTitle>
      <CardDescription>Somos uma agência de inteligência artificial aplicada a processos de negócio. Entendemos como a empresa do cliente funciona e levamos IA para dentro da operação: agentes, automações e sistemas conectados ao que já existe.</CardDescription></CardHeader></Card>

    <div className="flex flex-col gap-3">
      <div role="heading" aria-level={2} className="text-lg font-semibold">O que entregamos</div>
      <div className="grid gap-4 md:grid-cols-2">
        {solutions.map(item => <Card key={item.title}><CardHeader><div className="flex items-center gap-3"><item.icon className="size-5 text-primary" aria-hidden="true" /><CardTitle>{item.title}</CardTitle></div>
          <CardDescription>{item.description}</CardDescription></CardHeader></Card>)}
      </div>
    </div>

    <div className="flex flex-col gap-3">
      <div role="heading" aria-level={2} className="text-lg font-semibold">Como trabalhamos</div>
      <ol className="grid gap-4 md:grid-cols-4">
        {steps.map((step, index) => <li key={step.title}><Card className="h-full"><CardHeader><Badge variant="outline" className="w-fit">Etapa {index + 1}</Badge><CardTitle className="text-base">{step.title}</CardTitle><CardDescription>{step.text}</CardDescription></CardHeader></Card></li>)}
      </ol>
    </div>

    <div className="flex flex-col gap-3">
      <div role="heading" aria-level={2} className="text-lg font-semibold">Como o painel está organizado</div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader><CardTitle className="text-base">Geral</CardTitle><CardDescription>O que é de todos: documentos, chat, avisos, membros e o seu perfil.</CardDescription></CardHeader></Card>
        <Card><CardHeader><div className="flex items-center gap-2"><Briefcase className="size-4 text-primary" aria-hidden="true" /><CardTitle className="text-base">Comercial</CardTitle></div><CardDescription>Prospecção, clientes e funil de vendas.</CardDescription></CardHeader></Card>
        <Card><CardHeader><div className="flex items-center gap-2"><TerminalSquare className="size-4 text-primary" aria-hidden="true" /><CardTitle className="text-base">Desenvolvimento</CardTitle></div><CardDescription>Automações, integrações e infraestrutura.</CardDescription></CardHeader></Card>
      </div>
      <p className="text-sm text-muted-foreground">Use "Trocar" no topo do menu para ir de uma área para outra. Você só vê as áreas liberadas para o seu cargo.</p>
    </div>

    <div className="flex flex-col gap-3">
      <div role="heading" aria-level={2} className="text-lg font-semibold">Atalhos</div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {SHORTCUTS.map(item => <Card key={item.page}><CardHeader><item.icon className="size-5 text-primary" aria-hidden="true" /><CardTitle className="text-base">{item.label}</CardTitle><CardDescription>{item.description}</CardDescription>
          <Button variant="outline" size="sm" className="mt-2 w-fit" onClick={() => onOpen(item.page)}>Abrir</Button></CardHeader></Card>)}
      </div>
    </div>
  </section>;
}
