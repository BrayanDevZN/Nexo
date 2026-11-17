import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import { useMotionPreferences } from "@/components/MotionProvider";
import { contactUrl } from "@/lib/content";

type Line = { from: "client" | "nexo"; text: string };
type Scenario = { id: string; tab: string; title: string; time: string; lines: Line[]; done: string };

/** Made-up conversations, in plain words, to show what the attendant does for a business. */
const scenarios: Scenario[] = [
  {
    id: "agenda",
    tab: "Marcar horário",
    title: "Atendimento de salão",
    time: "21:47",
    lines: [
      { from: "client", text: "Oi! Vocês têm horário amanhã à tarde?" },
      { from: "nexo", text: "Oi! Tenho 14h e 16h30. Qual fica melhor para você?" },
      { from: "client", text: "16h30, por favor." },
      { from: "nexo", text: "Pronto, está marcado! Amanhã cedo eu te lembro." },
    ],
    done: "Horário na agenda e equipe avisada",
  },
  {
    id: "pedido",
    tab: "Fazer um pedido",
    title: "Confeitaria",
    time: "19:12",
    lines: [
      { from: "client", text: "Quero 2 bolos de chocolate para sexta." },
      { from: "nexo", text: "Anotado: 2 bolos de chocolate, retirada na sexta. Posso confirmar?" },
      { from: "client", text: "Pode confirmar!" },
      { from: "nexo", text: "Pedido confirmado. Já avisei a cozinha." },
    ],
    done: "Pedido enviado para a cozinha",
  },
  {
    id: "duvida",
    tab: "Tirar dúvidas",
    title: "Loja de bairro",
    time: "23:05",
    lines: [
      { from: "client", text: "Vocês entregam no meu bairro?" },
      { from: "nexo", text: "Entregamos sim! O prazo médio é de 40 minutos." },
      { from: "client", text: "E aceitam Pix?" },
      { from: "nexo", text: "Aceitamos Pix, cartão e dinheiro. Quer que eu já anote o seu pedido?" },
    ],
    done: "Respondido em segundos, de madrugada",
  },
];

const points = [
  "Responde na hora, a qualquer horário, do jeito da sua empresa.",
  "Anota o pedido ou o horário sem ninguém precisar digitar.",
  "Chama uma pessoa da equipe só quando for preciso.",
];

export function ChatDemo() {
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState(0); // how many bubbles are on screen
  const { reduced, paused } = useMotionPreferences();
  const scenario = scenarios[index];
  const total = scenario.lines.length + 1; // the bubbles, then the "done" note
  const logRef = useRef<HTMLDivElement>(null);
  const still = reduced || paused;

  useEffect(() => {
    if (still) {
      setStep(total);
      return;
    }
    setStep(0);
    let current = 0;
    const timer = window.setInterval(() => {
      current += 1;
      setStep(current);
      if (current >= total) {
        window.clearInterval(timer);
        // After a pause, move on to the next conversation.
        window.setTimeout(() => setIndex((value) => (value + 1) % scenarios.length), 4200);
      }
    }, 1100);
    return () => window.clearInterval(timer);
  }, [index, total, still]);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [step]);

  const typing = !still && step < scenario.lines.length && scenario.lines[step]?.from === "nexo";

  return (
    <section id="demonstracao" className="ll-demo" aria-labelledby="ll-demo-title">
      <div className="ll-wrap ll-demo-grid">
        <div className="ll-demo-copy">
          <p className="ll-tag nx-reveal">Na prática</p>
          <h2 id="ll-demo-title" className="ll-h2 nx-reveal">
            Veja a Nexo <em>conversando</em> com o seu cliente.
          </h2>
          <ul className="ll-demo-points nx-reveal">
            {points.map((point) => (
              <li key={point}>
                <Check aria-hidden="true" /> {point}
              </li>
            ))}
          </ul>
          <div className="ll-demo-tabs nx-reveal" role="tablist" aria-label="Exemplos de conversa">
            {scenarios.map((item, i) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                className="ll-demo-tab"
                onClick={() => setIndex(i)}
              >
                {item.tab}
              </button>
            ))}
          </div>
          <a className="ll-pill nx-reveal" href={contactUrl} target="_blank" rel="noopener noreferrer">
            Quero algo assim na minha empresa <ArrowUpRight aria-hidden="true" />
          </a>
        </div>

        <figure className="ll-phone nx-reveal" aria-label={`Exemplo ilustrativo: ${scenario.title}`}>
          <div className="ll-phone-bar">
            <img src="/images/nexo-symbol-purple.png" width="34" height="34" alt="" aria-hidden="true" />
            <div>
              <strong>Atendente Nexo</strong>
              <span>
                <i aria-hidden="true" /> online agora
              </span>
            </div>
            <small>{scenario.time}</small>
          </div>
          <div className="ll-chat" ref={logRef} aria-live="polite">
            {scenario.lines.slice(0, step).map((line, i) => (
              <p key={`${scenario.id}-${i}`} className={`ll-bubble ll-bubble-${line.from}`}>
                {line.text}
              </p>
            ))}
            {typing ? (
              <p className="ll-bubble ll-bubble-nexo ll-typing" aria-hidden="true">
                <i /> <i /> <i />
              </p>
            ) : null}
            {step >= total ? (
              <p className="ll-chat-done">
                <Check aria-hidden="true" /> {scenario.done}
              </p>
            ) : null}
          </div>
          <figcaption>Exemplo ilustrativo, com dados fictícios.</figcaption>
        </figure>
      </div>
    </section>
  );
}
