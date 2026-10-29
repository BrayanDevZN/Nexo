import { useEffect, useRef, useState } from "react";
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
const compactEvents: Record<string, string[]> = {
  "Contabilidade conectada": [
    "Extratos e notas organizados.",
    "Lançamentos comparados com o extrato.",
    "Diferença de valor enviada para revisão.",
    "Resumo financeiro pronto para conferência.",
  ],
  "Marketing com contexto": [
    "Público e diretrizes da marca consultados.",
    "Histórico de campanhas analisado.",
    "Anúncios e conteúdo preparados.",
    "Plano de campanha enviado para revisão.",
  ],
  "Atendimento integrado": [
    "Solicitação e histórico consultados.",
    "Pedido e políticas conferidos.",
    "Resposta personalizada preparada.",
    "CRM atualizado e caso encaminhado.",
  ],
};

type Scenario = (typeof scenarios)[number];

// Writing the same inline style again still invalidates styles, so only touch what changed.
function show(element: HTMLElement | null, visible: boolean) {
  if (!element) return;
  const next = visible ? "" : "none";
  if (element.style.display !== next) element.style.display = next;
}

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
  const tickRef = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  // The state of every line at a given tick. Typing only changes a few text nodes and classes,
  // so it is written straight to the DOM instead of re-rendering the whole card 15 times a second.
  const snapshot = (tick: number) => {
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
    return { output, stage, finished: output.every((item) => item.done) };
  };
  const paint = (tick: number) => {
    const node = root.current;
    if (!node) return;
    const { output, stage, finished } = snapshot(tick);
    node.querySelectorAll<HTMLElement>("[data-step]").forEach((step, index) => {
      step.classList.toggle("is-current", index <= stage);
    });
    node.querySelectorAll<HTMLElement>("[data-event]").forEach((line, index) => {
      const item = output[index];
      line.classList.toggle("is-started", item.started);
      line.classList.toggle("is-complete", item.done);
      const desktop = line.querySelector<HTMLElement>("[data-desktop]");
      const mobile = line.querySelector<HTMLElement>("[data-mobile]");
      const check = line.querySelector<HTMLElement>("[data-check]");
      const caret = line.querySelector<HTMLElement>("[data-caret]");
      const full = compactEvents[scenario.title][index];
      const desktopText = item.text.slice(0, item.count);
      const mobileText = full.slice(
        0,
        Math.ceil((item.count / item.text.length) * full.length),
      );
      if (desktop && desktop.textContent !== desktopText) desktop.textContent = desktopText;
      if (mobile && mobile.textContent !== mobileText) mobile.textContent = mobileText;
      show(check, item.done);
      show(caret, item.started && !item.done);
    });
    const result = node.querySelector<HTMLElement>("[data-result]");
    const label = finished ? scenario.result : "Simulação em andamento";
    if (result && result.textContent !== label) result.textContent = label;
  };
  useEffect(() => {
    if (reduced) paint(0);
  }, [reduced]);
  useEffect(() => {
    if (!running || reduced) return;
    // Time based: a slow computer skips steps instead of typing slower than a fast one.
    let frame = 0;
    let last = performance.now();
    let pending = 0;
    const loop = (now: number) => {
      pending += now - last;
      last = now;
      const steps = Math.floor(pending / TICK_MS);
      if (steps > 0) {
        pending -= steps * TICK_MS;
        tickRef.current = (tickRef.current + steps) % totalTicks;
        paint(tickRef.current);
      }
      frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, reduced, totalTicks]);
  const first = snapshot(0);
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
      <CardContent ref={root} className="flex flex-col gap-5">
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
              data-step
              className={cn("stream-step", index <= first.stage && "is-current")}
            >
              <i />
              {event.label}
            </span>
          ))}
        </div>
        <div className="stream-log" aria-hidden="true">
          {first.output.map((event, index) => (
            <div
              key={event.label}
              data-event
              className={cn(
                "stream-event",
                event.started && "is-started",
                event.done && "is-complete",
              )}
            >
              
              <div>
                <strong>
                  {event.label}
                  <Check
                    data-check
                    className="size-3"
                    style={{ display: event.done ? undefined : "none" }}
                  />
                </strong>
                <p>
                  <span className="desktop-copy" data-desktop>
                    {event.text.slice(0, event.count)}
                  </span>
                  <span className="mobile-copy" data-mobile>
                    {compactEvents[scenario.title][index].slice(
                      0,
                      Math.ceil(
                        (event.count / event.text.length) *
                          compactEvents[scenario.title][index].length,
                      ),
                    )}
                  </span>
                  <span
                    data-caret
                    className="stream-caret"
                    style={{
                      display: event.started && !event.done ? undefined : "none",
                    }}
                  />
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
            <span data-result>
              {first.finished ? scenario.result : "Simulação em andamento"}
            </span>
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
        <h2 id="stream-title">
          Da contabilidade
          <br />
          <span>ao relacionamento.</span>
        </h2>
        <p className="section-description">
          Veja na prática como a IA pode ajudar em diferentes áreas da empresa,
          do primeiro contato até o resultado entregue para a sua equipe.
        </p>
        <ol className="stream-explainer">
          <li>
            <div>
              <h3>Entende o contexto</h3>
              <p>
                Consulta documentos e dados autorizados para tratar cada
                solicitação.
              </p>
            </div>
          </li>
          <li>
            <div>
              <h3>Conecta as etapas</h3>
              <p>
                Combina IA, integrações e regras de negócio em um processo
                completo.
              </p>
            </div>
          </li>
          <li>
            <div>
              <h3>Mantém a equipe no controle</h3>
              <p>
                Separa exceções e pede aprovação antes de ações que exigem
                conferência.
              </p>
            </div>
          </li>
        </ol>
        <Button variant="outline" size="lg" asChild className="h-auto max-w-full whitespace-normal py-2.5 text-left">
          <a href={contactUrl} target="_blank" rel="noopener noreferrer">
            Desenhar o fluxo da minha empresa{" "}
            <ArrowUpRight data-icon="inline-end" />
          </a>
        </Button>
      </div>
      <div className="stream-gallery">
        <div className="stream-example-notice">
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
              Exemplo {current + 1} de {scenarios.length}: {scenarios[current].title}
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
