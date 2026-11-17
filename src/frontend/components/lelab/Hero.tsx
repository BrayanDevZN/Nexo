import { useRef } from "react";
import { ArrowDown, Mail, MessageCircle } from "lucide-react";
import { contactUrl } from "@/lib/content";

const keywords = ["agentes de IA", "automação", "integrações", "software sob medida"];

/** The round CTA from the reference: a ring that morphs and follows the pointer a little (a magnet). */
function MagnetButton() {
  const ref = useRef<HTMLAnchorElement>(null);
  const move = (event: React.PointerEvent<HTMLAnchorElement>) => {
    const el = ref.current;
    if (!el || event.pointerType !== "mouse") return;
    const box = el.getBoundingClientRect();
    const x = (event.clientX - (box.left + box.width / 2)) * 0.25;
    const y = (event.clientY - (box.top + box.height / 2)) * 0.25;
    el.style.setProperty("--mx", `${x}px`);
    el.style.setProperty("--my", `${y}px`);
  };
  const leave = () => {
    ref.current?.style.setProperty("--mx", "0px");
    ref.current?.style.setProperty("--my", "0px");
  };
  return (
    <a
      ref={ref}
      className="ll-magnet"
      href={contactUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar com a Nexo no WhatsApp"
      onPointerMove={move}
      onPointerLeave={leave}
    >
      <i className="ll-blob ll-blob-1" />
      <i className="ll-blob ll-blob-2" />
      <i className="ll-blob ll-blob-3" />
      <span className="ll-magnet-core">
        <img src="/images/nexo-symbol-purple.png" width="56" height="56" alt="" aria-hidden="true" decoding="async" />
        <b>Vamos conversar</b>
      </span>
    </a>
  );
}

export function Hero() {
  return (
    <section id="inicio" className="ll-hero" aria-labelledby="ll-hero-title">
      <div className="ll-hero-top">
        <p className="ll-tag nx-reveal">Inteligência Artificial Aplicada</p>
      </div>
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
      <div className="ll-hero-grid">
        <p className="ll-hero-lead">
          Sua empresa cresceu, mas a rotina não acompanha? A Nexo tira do caminho o trabalho repetitivo para a sua equipe
          atender mais, errar menos e <strong>fechar mais negócios</strong>.
        </p>
        <MagnetButton />
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
