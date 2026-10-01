import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ArrowLeft,
  ArrowRight,
  Calculator,
  Megaphone,
  Users,
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
import { useMotionActivity } from "@/components/MotionProvider";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";
import { contactUrl } from "@/lib/content";

const scenarios = [
  {
    title: "Contabilidade conectada",
    icon: Calculator,
    input: "Extratos e notas fiscais",
    tag: "FINANCEIRO",
    result: "Resumo pronto para conferência",
    events: [
      {
        label: "Receber",
        text: "Extratos e notas fiscais recebidos. Organizando valores, datas e fornecedores do período.",
      },
      {
        label: "Interpretar",
        text: "Lançamentos classificados. Comparando os registros com o extrato para apoiar a conciliação.",
      },
      {
        label: "Validar",
        text: "Uma diferença de valor foi identificada. Separando o lançamento para revisão do responsável.",
      },
      {
        label: "Preparar",
        text: "Resumo financeiro preparado com entradas, saídas e pendências. A equipe confere antes do registro final.",
      },
    ],
  },
  {
    title: "Marketing com contexto",
    icon: Megaphone,
    input: "Briefing e histórico de campanhas",
    tag: "MARKETING",
    result: "Campanha pronta para revisão",
    events: [
      {
        label: "Conhecer",
        text: "Briefing recebido. Consultando o público, a oferta e as diretrizes de comunicação da marca.",
      },
      {
        label: "Analisar",
        text: "Histórico de campanhas organizado. Identificando temas e canais com maior resposta no exemplo.",
      },
      {
        label: "Criar",
        text: "Preparando três versões de anúncio, uma sequência de e-mails e um calendário de conteúdo.",
      },
      {
        label: "Planejar",
        text: "Plano de campanha montado. Textos e agendamento aguardam revisão antes da publicação.",
      },
    ],
  },
  {
    title: "Atendimento integrado",
    icon: Users,
    input: "Solicitação de um cliente",
    tag: "ATENDIMENTO",
    result: "Resposta preparada com contexto",
    events: [
      {
        label: "Receber",
        text: "Mensagem recebida. Identificando a solicitação e consultando o histórico autorizado do cliente.",
      },
      {
        label: "Buscar",
        text: "Informações encontradas na base interna. Conferindo o pedido e as políticas de atendimento.",
      },
      {
        label: "Responder",
        text: "Resposta personalizada preparada com as referências necessárias para orientar o cliente.",
      },
      {
        label: "Conectar",
        text: "Solicitação organizada no CRM. Casos que exigem negociação seguem para a equipe responsável.",
      },
    ],
  },
];
const TICK_MS = 65;
const CHARS_PER_TICK = 4;
const HOLD_TICKS = 16;
type Scenario = (typeof scenarios)[number];

function StreamSimulation({
  scenario,
  running,
  reduced,
}: {
  scenario: Scenario;
  running: boolean;
  reduced: boolean;
}) {
  const events = scenario.events;
  const lengths = events.map(
    (event) => Math.ceil(event.text.length / CHARS_PER_TICK) + HOLD_TICKS,
  );
  const totalTicks = lengths.reduce((sum, length) => sum + length, 0) + 60;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(
      () => setTick((value) => (value + 1) % totalTicks),
      TICK_MS,
    );
    return () => window.clearInterval(interval);
  }, [running, totalTicks]);
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
    <Card className="stream-console [--card-spacing:--spacing(6)]">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">EXEMPLO ILUSTRATIVO</Badge>
        </div>
        <div className="stream-console-heading">
          <CardTitle>
            <h3>{scenario.title}</h3>
          </CardTitle>
          <Workflow className="size-5 text-primary" aria-hidden="true" />
        </div>
        <CardDescription>
          Demonstração simulada · dados fictícios
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="stream-input">
          <scenario.icon className="size-5" aria-hidden="true" />
          <div>
            <strong>{scenario.input}</strong>
            <span>Entrada ilustrativa · dados fictícios</span>
          </div>
          <Badge variant="secondary">{scenario.tag}</Badge>
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
            {scenario.title}: {events.map((event) => event.text).join(" ")}
          </p>
        </div>
        <div className="stream-result">
          <Badge variant="outline">
            {finished ? scenario.result : "Simulação em andamento"}
          </Badge>
          <span>Execução conforme suas regras</span>
        </div>
      </CardContent>
      <CardFooter>
        <p className="body-copy">
          Ao final: {scenario.result.toLowerCase()}. Aprovação conforme as
          regras do negócio.
        </p>
      </CardFooter>
    </Card>
  );
}

export function StreamingDemo() {
  const { ref, active, reduced } = useMotionActivity<HTMLElement>();
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [visit, setVisit] = useState(0);
  useEffect(() => {
    if (!api) return;
    const sync = () => {
      setCurrent(api.selectedScrollSnap());
      setVisit((value) => value + 1);
    };
    sync();
    api.on("select", sync);
    return () => {
      api.off("select", sync);
    };
  }, [api]);
  return (
    <section
      ref={ref}
      id="demonstracao"
      className="section shell streaming-section"
      aria-labelledby="stream-title"
      data-motion={active ? "running" : "paused"}
    >
      <div className="streaming-copy">
        <p className="eyebrow">EXEMPLOS DE IA EM DIFERENTES ÁREAS</p>
        <h2 id="stream-title">
          Da contabilidade
          <br />
          <span>ao relacionamento.</span>
        </h2>
        <p className="section-description">
          Explore como a IA pode analisar informações, criar conteúdo e conectar
          tarefas em diferentes áreas. Cada exemplo mostra uma aplicação, do
          contexto inicial à entrega para a equipe.
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
      <div className="stream-gallery">
        <div className="stream-example-notice">
          <Badge>EXEMPLOS EM AÇÃO</Badge>
          <p>
            Simulações com dados fictícios para mostrar possibilidades de uso da
            IA.
          </p>
        </div>
        <Carousel
          opts={{ align: "start", loop: true, duration: reduced ? 0 : 25 }}
          setApi={setApi}
          aria-label="Exemplos de IA em ação"
        >
          <CarouselContent className="cursor-grab active:cursor-grabbing">
            {scenarios.map((scenario, index) => (
              <CarouselItem
                key={scenario.title}
                aria-label={scenario.title}
                aria-hidden={index !== current}
                inert={index !== current}
              >
                <StreamSimulation
                  key={`${index}-${index === current ? visit : "idle"}`}
                  scenario={scenario}
                  running={active && index === current}
                  reduced={reduced}
                />
              </CarouselItem>
            ))}
          </CarouselContent>
          <div className="carousel-toolbar">
            <p aria-live="polite">
              {current + 1} / {scenarios.length} · {scenarios[current].title}
              <br />
              Arraste para ver outro exemplo
            </p>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon-lg"
                aria-label="Exemplo anterior"
                onClick={() => api?.scrollPrev()}
              >
                <ArrowLeft />
              </Button>
              <Button
                variant="outline"
                size="icon-lg"
                aria-label="Próximo exemplo"
                onClick={() => api?.scrollNext()}
              >
                <ArrowRight />
              </Button>
            </div>
          </div>
        </Carousel>
      </div>
    </section>
  );
}
