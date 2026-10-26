import type { ReactNode } from "react";
import { Check, FileText, Mail, CalendarDays, Database, Workflow, Folder, Clock3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Message, MessageContent } from "@/components/ui/message";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";

/** Small product scenes built from the site's own shadcn components, with a short looping motion each. */
const tag = "h-6 px-2.5 text-[13px]";

function Row({ icon, children, delay = 0 }: { icon: ReactNode; children: ReactNode; delay?: number }) {
  return (
    <li className="art-row" style={{ animationDelay: `${delay}s` }}>
      {icon}
      <span>{children}</span>
    </li>
  );
}

const scenes: Record<string, { label: string; draw: () => ReactNode }> = {
  network: {
    label: "Sistemas, pessoas e IA ligados.",
    draw: () => <></>,
  },
  agent: {
    label: "Um agente de IA recebe uma solicitação e usa documentos, e-mail e agenda para respondê-la.",
    draw: () => (
      <Card className="art-card-ui">
        <CardHeader>
          <Badge variant="secondary" className={tag}><Spinner className="size-3" /> Em análise</Badge>
          <CardTitle>Solicitação do cliente</CardTitle>
          <CardDescription>Enviar segunda via e confirmar reunião.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ul className="art-chips">
            <li className="art-chip" style={{ animationDelay: "0s" }}><FileText /> Documentos</li>
            <li className="art-chip" style={{ animationDelay: "1.2s" }}><Mail /> E-mail</li>
            <li className="art-chip" style={{ animationDelay: "2.4s" }}><CalendarDays /> Agenda</li>
          </ul>
          <Badge className={`${tag} art-result`}><Check /> Resposta pronta para revisão</Badge>
        </CardContent>
      </Card>
    ),
  },
  flow: {
    label: "Um fluxo automático recebe documentos, valida e entrega o resultado.",
    draw: () => (
      <Card className="art-card-ui">
        <CardHeader>
          <CardTitle>Fluxo de documentos</CardTitle>
          <CardDescription>Do recebimento à entrega, sem copiar dados.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="art-steps">
            <Row icon={<Check />} delay={0}>Receber arquivos</Row>
            <Row icon={<Spinner className="size-4" />} delay={1}>Validar valores</Row>
            <Row icon={<Clock3 />} delay={2}>Entregar resumo</Row>
          </ul>
          <div className="art-progress"><Progress value={70} aria-label="Andamento do fluxo" className="h-2" /></div>
        </CardContent>
      </Card>
    ),
  },
  systems: {
    label: "Sistemas da empresa conectados por inteligência artificial.",
    draw: () => (
      <div className="art-stack">
        {[["ERP", Database], ["CRM", Workflow], ["API", FileText]].map(([name, Icon], i) => {
          const I = Icon as typeof Database;
          return (
            <Card key={name as string} size="sm" className="art-card-ui art-sys" style={{ animationDelay: `${i * 0.5}s` }}>
              <CardContent className="flex items-center justify-between gap-3">
                <span className="art-sys-name"><I /> {name as string}</span>
                <Badge variant="secondary" className={tag}><span className="art-live" /> Conectado</Badge>
              </CardContent>
            </Card>
          );
        })}
      </div>
    ),
  },
  custom: {
    label: "Um painel sob medida, montado para a rotina da empresa.",
    draw: () => (
      <Card className="art-card-ui">
        <CardHeader>
          <CardTitle>Painel sob medida</CardTitle>
          <CardDescription>Só o que a sua equipe usa.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {[["Atendimentos", 82], ["Pendências", 38], ["Entregas", 64]].map(([name, value], i) => (
            <div key={name as string} className="art-meter">
              <div><span>{name as string}</span><Badge variant="outline" className={tag}>{value as number}%</Badge></div>
              <div className="art-progress" style={{ animationDelay: `${i * 0.4}s` }}><Progress value={value as number} aria-label={name as string} className="h-2" /></div>
            </div>
          ))}
        </CardContent>
      </Card>
    ),
  },
  docs: {
    label: "Notas, extratos e comprovantes organizados por cliente.",
    draw: () => (
      <Card className="art-card-ui">
        <CardHeader>
          <CardTitle>Documentos do mês</CardTitle>
          <CardDescription>Organizados por cliente, sem cobrança manual.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="art-steps">
            <Row icon={<Folder />} delay={0}>Cliente A <Badge className={tag}>Completo</Badge></Row>
            <Row icon={<Folder />} delay={0.8}>Cliente B <Badge className={tag}>Completo</Badge></Row>
            <Row icon={<Folder />} delay={1.6}>Cliente C <Badge variant="outline" className={tag}>Falta o extrato</Badge></Row>
          </ul>
        </CardContent>
      </Card>
    ),
  },
  talk: {
    label: "Uma conversa inicial curta entre o escritório e a Nexo.",
    draw: () => (
      <div className="art-chat">
        <Message>
          <MessageContent><Bubble className="art-bubble"><BubbleContent>Hoje a equipe perde horas cobrando documentos.</BubbleContent></Bubble></MessageContent>
        </Message>
        <Message align="end">
          <MessageContent><Bubble variant="default" className="art-bubble art-bubble-2"><BubbleContent>Em 20 minutos mapeamos o que dá para automatizar.</BubbleContent></Bubble></MessageContent>
        </Message>
        <Badge variant="secondary" className={`${tag} art-chat-tag`}><Clock3 /> 20 minutos, sem custo</Badge>
      </div>
    ),
  },
  plan: {
    label: "Um plano em etapas, do desenho ao teste acompanhado.",
    draw: () => (
      <Card className="art-card-ui">
        <CardHeader>
          <CardTitle>Plano da automação</CardTitle>
          <CardDescription>Cada etapa com revisão humana.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="art-steps">
            <Row icon={<Check />} delay={0}>Mapear a rotina</Row>
            <Row icon={<Check />} delay={0.8}>Desenhar a automação</Row>
            <Row icon={<Spinner className="size-4" />} delay={1.6}>Testar e ajustar</Row>
          </ul>
        </CardContent>
      </Card>
    ),
  },
};

export type ArtName = keyof typeof scenes;

export function Art({ name, className }: { name: ArtName; className?: string }) {
  const scene = scenes[name];
  return (
    <figure className={className ? `nx-art ${className}` : "nx-art"} role="img" aria-label={scene.label}>
      <div className="art-frame" aria-hidden="true">{scene.draw()}</div>
    </figure>
  );
}
