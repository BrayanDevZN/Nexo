import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  FileText,
  RotateCcw,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MotionControl, useMotionActivity } from "@/components/MotionProvider";
import { cn } from "@/lib/utils";
import { contactUrl } from "@/lib/content";

const events = [
  {
    label: "Receber",
    text: "Documento de exemplo recebido. Iniciando a leitura dos campos e a organização das informações.",
  },
  {
    label: "Interpretar",
    text: "Fornecedor, data e valor identificados. Conferindo campos obrigatórios e possíveis duplicidades.",
  },
  {
    label: "Validar",
    text: "Uma divergência foi encontrada. Encaminhando o item para conferência da equipe responsável.",
  },
  {
    label: "Preparar",
    text: "Resumo preparado. O registro no sistema aguarda aprovação humana, conforme a regra deste fluxo.",
  },
];
const TICK_MS = 65;
const CHARS_PER_TICK = 4;
const HOLD_TICKS = 16;
const lengths = events.map(
  (event) => Math.ceil(event.text.length / CHARS_PER_TICK) + HOLD_TICKS,
);
const totalTicks = lengths.reduce((sum, length) => sum + length, 0) + 45;

export function StreamingDemo() {
  const { ref, active, reduced, paused } = useMotionActivity<HTMLElement>();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(
      () => setTick((value) => (value + 1) % totalTicks),
      TICK_MS,
    );
    return () => window.clearInterval(interval);
  }, [active]);
  let elapsed = 0;
  const output = events.map((event, index) => {
    const start = elapsed;
    elapsed += lengths[index];
    const count = reduced
      ? event.text.length
      : Math.max(
          0,
          Math.min(event.text.length, (tick - start) * CHARS_PER_TICK),
        );
    return {
      ...event,
      count,
      started: reduced || tick >= start,
      done: reduced || count === event.text.length,
    };
  });
  const stage = Math.max(
    0,
    output.reduce((last, item, index) => (item.started ? index : last), 0),
  );
  const finished = output.every((item) => item.done);
  return (
    <section
      ref={ref}
      id="demonstracao"
      className="section shell streaming-section"
      aria-labelledby="stream-title"
      data-motion={active ? "running" : "paused"}
    >
      <div className="streaming-copy">
        <p className="eyebrow">DA INFORMAÇÃO À EXECUÇÃO</p>
        <h2 id="stream-title">
          Veja o trabalho
          <br />
          <span>ganhar fluxo.</span>
        </h2>
        <p className="section-description">
          Uma informação chega. A IA interpreta. As regras definem o próximo
          passo. Sua equipe acompanha o que precisa de atenção.
        </p>
        <ol className="stream-explainer">
          <li>
            <span>01</span>
            <div>
              <h3>Entende o contexto</h3>
              <p>
                Consulta documentos e dados autorizados para tratar cada
                solicitação.
              </p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>Conecta as etapas</h3>
              <p>
                Combina IA, integrações e regras de negócio em um processo
                completo.
              </p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>Mantém a equipe no controle</h3>
              <p>
                Separa exceções e pede aprovação antes de ações que exigem
                conferência.
              </p>
            </div>
          </li>
        </ol>
        <Button variant="outline" size="lg" asChild>
          <a href={contactUrl} target="_blank" rel="noopener noreferrer">
            Desenhar o fluxo da minha empresa{" "}
            <ArrowUpRight data-icon="inline-end" />
          </a>
        </Button>
      </div>
      <Card className="stream-console [--card-spacing:--spacing(6)]">
        <CardHeader>
          <div className="stream-console-heading">
            <CardTitle>
              <h3>Processamento de documentos</h3>
            </CardTitle>
            <Workflow className="size-5 text-primary" aria-hidden="true" />
          </div>
          <CardDescription>
            Demonstração simulada · dados fictícios
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="stream-input">
            <FileText className="size-5" aria-hidden="true" />
            <div>
              <strong>documento_exemplo.pdf</strong>
              <span>Entrada ilustrativa · nenhum arquivo real</span>
            </div>
            <Badge variant="secondary">PDF</Badge>
          </div>
          <div className="stream-progress" aria-hidden="true">
            {events.map((event, index) => (
              <span
                key={event.label}
                className={cn("stream-step", index <= stage && "is-current")}
              >
                <i />
                {event.label}
              </span>
            ))}
          </div>
          <div className="stream-log" aria-hidden="true">
            {output.map((event, index) => (
              <div
                key={event.label}
                className={cn(
                  "stream-event",
                  event.started && "is-started",
                  event.done && "is-complete",
                )}
              >
                <span className="stream-event-index">0{index + 1}</span>
                <div>
                  <strong>
                    {event.label}
                    {event.done && <Check className="size-3" />}
                  </strong>
                  <p>
                    {event.text.slice(0, event.count)}
                    {event.started && !event.done && (
                      <span className="stream-caret" />
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="sr-only">
            <p>
              Demonstração: leitura de um documento, extração de dados,
              identificação de divergência e preparação de um resumo. O registro
              final exige aprovação humana.
            </p>
          </div>
          <div className="stream-result">
            <Badge variant="outline">
              {finished
                ? "Aguardando aprovação"
                : paused
                  ? "Simulação pausada"
                  : "Simulação em andamento"}
            </Badge>
            <span>Execução conforme suas regras</span>
          </div>
        </CardContent>
        <CardFooter className="flex-wrap justify-between gap-2">
          <MotionControl />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTick(0)}
            disabled={reduced}
            aria-label="Reiniciar demonstração"
          >
            <RotateCcw data-icon="inline-start" />
            Reiniciar
          </Button>
        </CardFooter>
      </Card>
    </section>
  );
}
