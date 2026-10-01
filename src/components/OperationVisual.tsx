import {
  Check,
  Database,
  FileText,
  BrainCircuit,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Brand } from "@/components/Brand";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { IntelligenceCore } from "@/components/IntelligenceCore";
import { MotionControl, useMotionActivity } from "@/components/MotionProvider";

export function OperationVisual() {
  const { ref, active } = useMotionActivity<HTMLElement>();
  return (
    <figure
      ref={ref}
      data-motion={active ? "running" : "paused"}
      className="operation-visual"
      aria-label="Inteligência artificial conectando dados, conhecimento e processos para analisar, criar e executar com supervisão humana."
    >
      <div className="visual-topline">
        <span className="tiny-label">IA PARA TODO O NEGÓCIO</span>
        <Badge variant="outline">Visão ilustrativa</Badge>
      </div>
      <div className="sources">
        <div>
          <BrainCircuit aria-hidden="true" />
          <span>Conhecimento</span>
        </div>
        <div>
          <FileText aria-hidden="true" />
          <span>Dados</span>
        </div>
        <div>
          <Database aria-hidden="true" />
          <span>Processos</span>
        </div>
      </div>
      <IntelligenceCore />
      <div className="connector-branches" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="intelligence-node">
        <div className="node-symbol">
          <Brand compact />
        </div>
        <div>
          <span className="tiny-label">INTELIGÊNCIA CONECTADA</span>
          <strong>Entender. Criar. Executar.</strong>
        </div>
        <Sparkles className="size-5" aria-hidden="true" />
      </div>
      <div className="connector-line" aria-hidden="true" />
      <Card className="mx-auto w-[88%]">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Uma inteligência, várias aplicações</CardTitle>
            <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
          </div>
          <CardDescription>
            Soluções desenhadas para cada desafio.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="execution-list">
            <li>
              <Check aria-hidden="true" />
              <span>Analisar dados e apoiar decisões</span>
              <span>01</span>
            </li>
            <li>
              <Check aria-hidden="true" />
              <span>Criar respostas e conteúdo útil</span>
              <span>02</span>
            </li>
            <li>
              <Check aria-hidden="true" />
              <span>Automatizar tarefas e conectar sistemas</span>
              <span>03</span>
            </li>
          </ol>
        </CardContent>
      </Card>
      <figcaption>
        <span className="signal-dot" /> Pessoas no controle. Tecnologia na
        execução.
      </figcaption>
      <div className="motion-toolbar">
        <MotionControl />
      </div>
    </figure>
  );
}
