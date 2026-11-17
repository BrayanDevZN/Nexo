import { useState } from "react";
import { ArrowUpRight, Plus } from "lucide-react";
import { contactUrl, solutions, steps } from "@/lib/content";

function Service({ item }: { item: (typeof solutions)[number] }) {
  const [open, setOpen] = useState(false);
  const Icon = item.icon;
  const panel = `ll-more-${item.number}`;
  return (
    <article className="ll-card nx-reveal" id={`estacao-${Number(item.number)}`} aria-labelledby={`ll-s-${item.number}`}>
      <div className="ll-card-top">
        <span className="ll-card-icon" aria-hidden="true">
          <Icon />
        </span>
        <span className="ll-mono ll-card-n" aria-hidden="true">
          {item.number}
        </span>
      </div>
      <h3 id={`ll-s-${item.number}`} className="ll-card-title">
        {item.title}
      </h3>
      <p className="ll-card-text">{item.description}</p>
      <ul className="ll-chips" aria-label="Aplicações">
        {item.tags.map((tag) => (
          <li key={tag} className="ll-mono">
            {tag}
          </li>
        ))}
      </ul>
      <button type="button" className="ll-more-btn" aria-expanded={open} aria-controls={panel} onClick={() => setOpen((v) => !v)}>
        <Plus aria-hidden="true" /> {open ? "Fechar detalhes" : "Ver detalhes"}
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
    </article>
  );
}

export function Services() {
  return (
    <section id="solucoes" className="ll-section" aria-labelledby="ll-solutions-title">
      <div className="ll-wrap ll-head">
        <p className="ll-tag ll-mono nx-reveal">Soluções</p>
        <h2 id="ll-solutions-title" className="ll-h2 nx-reveal">
          Quatro jeitos de <em>devolver tempo</em> à sua equipe.
        </h2>
      </div>
      <div className="ll-wrap ll-bento">
        {solutions.map((item) => (
          <Service key={item.number} item={item} />
        ))}
      </div>
    </section>
  );
}

const tools = ["WhatsApp", "E-mail", "CRM", "ERP", "Planilhas", "Documentos", "Agenda", "Formulários", "APIs", "Banco de dados"];

/** Where the reference has a wall of client logos, we show what the solutions plug into (no invented clients). */
export function Marquee() {
  const row = [...tools, ...tools];
  return (
    <div className="ll-marquee" role="group" aria-label="A Nexo se conecta com as ferramentas que você já usa">
      <div className="ll-marquee-track" aria-hidden="true">
        {row.map((tool, index) => (
          <span key={`${tool}-${index}`}>
            {tool}
            <img src="/images/nexo-symbol-purple.png" width="28" height="28" alt="" decoding="async" />
          </span>
        ))}
      </div>
      <p className="sr-only">Conecta com: {tools.join(", ")}.</p>
    </div>
  );
}

export function Process() {
  return (
    <section id="processo" className="ll-process" aria-labelledby="ll-process-title">
      <div className="ll-wrap">
        <div className="ll-head">
          <p className="ll-tag ll-mono nx-reveal">Como funciona</p>
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
        <div>
          <p className="ll-tag ll-mono nx-reveal">A Nexo</p>
          <h2 id="ll-about-title" className="ll-h2 nx-reveal">
            Tecnologia explicada em <em>português simples</em>.
          </h2>
        </div>
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
    </section>
  );
}
