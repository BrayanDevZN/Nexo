import { useState } from "react";
import { ArrowUpRight, Plus } from "lucide-react";
import { contactUrl, solutions, steps } from "@/lib/content";
import { ConstellationArt, serviceArts } from "@/components/lelab/Illustrations";

const tones = ["ink", "paper", "violet", "stone"] as const;

function Service({ item, tone, index }: { item: (typeof solutions)[number]; tone: (typeof tones)[number]; index: number }) {
  const [open, setOpen] = useState(false);
  const Art = serviceArts[index % serviceArts.length];
  const panel = `ll-more-${item.number}`;
  return (
    <article className="ll-service" data-tone={tone} id={`estacao-${Number(item.number)}`} aria-labelledby={`ll-s-${item.number}`}>
      <div className="ll-wrap ll-service-grid">
        <div className="ll-service-art nx-reveal" aria-hidden="true">
          <span className="ll-bignum">{item.number}</span>
          <Art />
        </div>
        <div className="ll-service-copy">
          <p className="ll-tags nx-reveal">{item.tags.join("  ·  ")}</p>
          <h3 id={`ll-s-${item.number}`} className="ll-service-title nx-reveal">
            {item.title}
          </h3>
          <p className="ll-service-text nx-reveal">{item.description}</p>
          <button type="button" className="ll-more-btn" aria-expanded={open} aria-controls={panel} onClick={() => setOpen((v) => !v)}>
            <Plus aria-hidden="true" /> {open ? "Fechar detalhes" : "Em detalhes"}
          </button>
          <div id={panel} className="ll-more" hidden={!open}>
            <ul>
              {item.includes.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <blockquote>
              <strong>Na prática.</strong> {item.example}
            </blockquote>
          </div>
        </div>
      </div>
    </article>
  );
}

export function Services() {
  return (
    <section id="solucoes" aria-labelledby="ll-solutions-title">
      <div className="ll-wrap ll-head">
        <p className="ll-tag nx-reveal">O que fazemos</p>
        <h2 id="ll-solutions-title" className="ll-h2 nx-reveal">
          Quatro jeitos de <em>devolver tempo</em> à sua equipe.
        </h2>
      </div>
      {solutions.map((item, index) => (
        <Service key={item.number} item={item} tone={tones[index % tones.length]} index={index} />
      ))}
    </section>
  );
}

const tools = ["Atendimento", "WhatsApp", "Pedidos", "Agenda", "Clientes", "Orçamentos", "E-mail", "Cobranças", "Estoque", "Documentos", "Equipe", "Vendas"];

/** Where the reference has a wall of client logos, we show, in everyday words, what the Nexo takes care of (no invented clients). */
export function Marquee() {
  const row = [...tools, ...tools];
  return (
    <div className="ll-marquee" role="group" aria-label="O que a Nexo faz no dia a dia da sua empresa">
      <div className="ll-marquee-track" aria-hidden="true">
        {row.map((tool, index) => (
          <span key={`${tool}-${index}`}>
            {tool}
            <img src="/images/nexo-symbol-purple.png" width="28" height="28" alt="" decoding="async" />
          </span>
        ))}
      </div>
      <p className="sr-only">Cuida de: {tools.join(", ")}.</p>
    </div>
  );
}

export function Process() {
  return (
    <section id="processo" className="ll-process" aria-labelledby="ll-process-title">
      <div className="ll-wrap">
        <div className="ll-head">
          <p className="ll-tag nx-reveal">Como funciona</p>
          <h2 id="ll-process-title" className="ll-h2 nx-reveal">
            Do primeiro papo ao <em>resultado</em>, em quatro passos.
          </h2>
        </div>
        <ol className="ll-steps">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <li key={step.title} className="ll-step nx-reveal">
                <span className="ll-step-n">{String(index + 1).padStart(2, "0")}</span>
                <Icon className="ll-step-icon" aria-hidden="true" />
                <h3>{step.title}</h3>
                <p>{step.text}</p>
                <small>{step.delivery}</small>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

export function About() {
  return (
    <section id="sobre" className="ll-about" aria-labelledby="ll-about-title">
      <div className="ll-wrap ll-about-grid">
        <div className="ll-about-text">
          <p className="ll-tag nx-reveal">A Nexo</p>
          <h2 id="ll-about-title" className="ll-h2 nx-reveal">
            Tecnologia explicada em <em>português simples</em>.
          </h2>
          <div className="ll-about-copy">
            <p className="nx-reveal">
              Você conta o problema do jeito que ele aparece no seu dia a dia. A gente escolhe a melhor forma de resolver, mostra
              o plano, o prazo e o valor <strong>antes</strong> de começar e combina como medir se deu certo.
            </p>
            <p className="nx-reveal">Nas decisões importantes, uma pessoa da sua equipe confirma. Você mantém o controle.</p>
            <a className="ll-pill nx-reveal" href={contactUrl} target="_blank" rel="noopener noreferrer">
              Quero conversar <ArrowUpRight aria-hidden="true" />
            </a>
          </div>
        </div>
        <div className="ll-about-art nx-reveal">
          <ConstellationArt />
        </div>
      </div>
    </section>
  );
}
