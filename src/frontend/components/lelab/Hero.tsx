import { ArrowDown, ArrowUpRight, CalendarCheck, Mail, MessageCircle, PackageCheck } from "lucide-react";
import { contactUrl } from "@/lib/content";

const keywords = ["agentes de IA", "automação", "integrações", "software sob medida"];

export function Hero() {
  return (
    <section id="inicio" className="ll-hero" aria-labelledby="ll-hero-title">
      <div className="ll-hero-top">
        <p className="ll-tag nx-reveal">Inteligência Artificial Aplicada</p>
      </div>
      <div className="ll-hero-grid">
        <div className="ll-hero-copy">
          <h1 id="ll-hero-title" className="ll-giant">
            <span>IA aplicada</span>
            <span>
              ao seu <em>negócio</em>
              <i className="ll-dot">.</i>
            </span>
          </h1>
          <p className="ll-keywords" aria-label="O que fazemos">
            {keywords.map((word, index) => (
              <span key={word}>
                {index > 0 ? <i aria-hidden="true">|</i> : null}
                {word}
              </span>
            ))}
          </p>
          <p className="ll-hero-lead">
            Sua empresa cresceu, mas a rotina não acompanha? A Nexo tira do caminho o trabalho repetitivo para a sua equipe
            atender mais, errar menos e <strong>fechar mais negócios</strong>.
          </p>
          <div className="ll-hero-actions">
            <a className="ll-pill" href={contactUrl} target="_blank" rel="noopener noreferrer">
              Falar no WhatsApp <ArrowUpRight aria-hidden="true" />
            </a>
            <a className="ll-textlink" href="#solucoes">
              Ver soluções
            </a>
          </div>
        </div>
        <div className="ll-hero-logo" aria-hidden="true">
          <i className="ll-logo-ring ll-logo-ring-1" />
          <i className="ll-logo-ring ll-logo-ring-2" />
          <img src="/images/nexo-symbol-purple-xl.png" width="720" height="716" alt="" decoding="async" fetchPriority="high" />
          <div className="ll-chip ll-chip-1">
            <b />
            <span>Oi! Posso ajudar?</span>
          </div>
          <div className="ll-chip ll-chip-2">
            <CalendarCheck aria-hidden="true" />
            <span>Agenda atualizada</span>
          </div>
          <div className="ll-chip ll-chip-3">
            <PackageCheck aria-hidden="true" />
            <span>Pedido confirmado</span>
          </div>
        </div>
      </div>
      <a className="ll-scroll" href="#solucoes" aria-label="Rolar para as soluções">
        <span>Role</span>
        <ArrowDown aria-hidden="true" />
      </a>
      <ul className="ll-contactbar" aria-label="Contato">
        <li>
          <a href={contactUrl} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">
            <MessageCircle aria-hidden="true" />
          </a>
        </li>
        <li>
          <a href="mailto:nexo.bd.owners@gmail.com" aria-label="E-mail">
            <Mail aria-hidden="true" />
          </a>
        </li>
      </ul>
    </section>
  );
}
