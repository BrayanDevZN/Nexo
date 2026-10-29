import { Fragment } from "react";
import { ArrowUpRight } from "lucide-react";
import { Brand } from "@/components/Brand";
import { CookiePreferencesButton } from "@/components/CookieNotice";
import { Button } from "@/components/ui/button";
import { useMotionPreferences } from "@/components/MotionProvider";
import { useScrollTrigger } from "@/hooks/useScrollTrigger";
import { contactUrl, navigation } from "@/lib/content";

/** Words that appear one after another, like a reply being streamed. `start` is the index of the first word. */
function Streamed({ text, start = 0 }: { text: string; start?: number }) {
  const words = text.split(" ");
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((word, index) => (
          <Fragment key={index}>
            <span className="nx-stream-word" style={{ "--i": start + index } as React.CSSProperties}>
              {word}
            </span>
            {index < words.length - 1 ? " " : null}
          </Fragment>
        ))}
      </span>
    </>
  );
}

const TITLE = ["Vamos encontrar", "o nexo."];
const LEAD =
  "Sua empresa cresceu, mas a rotina não acompanha? Conte para a gente o que mais toma o tempo da sua equipe. Em uma conversa, mostramos por onde começar.";

export function Close() {
  const { reduced, setReduced } = useMotionPreferences();
  const [cta, ctaSeen] = useScrollTrigger<HTMLElement>(0.45, 0.9);
  const [footer, footerSeen] = useScrollTrigger<HTMLElement>(0.9, 1.05);
  const titleWords = TITLE.join(" ").split(" ").length;
  const leadWords = LEAD.split(" ").length;
  return (
    <div className="nx-inverse nx-close">
      <section
        id="contato"
        ref={cta}
        data-stream={ctaSeen ? "on" : "off"}
        className="nx-wrap nx-cta"
        aria-labelledby="contact-title"
      >
        <h2 id="contact-title" className="nx-display nx-cta-title">
          <Streamed text={TITLE[0]} />
          <Streamed text={TITLE[1]} start={TITLE[0].split(" ").length} />
        </h2>
        <div className="nx-cta-foot">
          <p className="nx-lead nx-stream-lead" style={{ "--i": titleWords } as React.CSSProperties}>
            <Streamed text={LEAD} start={titleWords} />
            <span className="nx-caret" aria-hidden="true" style={{ "--i": titleWords + leadWords } as React.CSSProperties} />
          </p>
          <Button size="lg" asChild className="nx-cta-button nx-stream-pop" style={{ "--i": titleWords + leadWords + 2 } as React.CSSProperties}>
            <a href={contactUrl} target="_blank" rel="noopener noreferrer">
              Falar com a Nexo no WhatsApp <ArrowUpRight data-icon="inline-end" />
            </a>
          </Button>
        </div>
      </section>
      <footer ref={footer} data-stream={footerSeen ? "on" : "off"} className="nx-wrap nx-footer">
        <div className="nx-footer-top">
          <a href="#inicio" aria-label="Nexo: voltar ao início">
            <Brand />
          </a>
          <nav aria-label="Navegação do rodapé">
            {navigation.map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            ))}
            <a href={contactUrl} target="_blank" rel="noopener noreferrer">
              Contato
            </a>
          </nav>
        </div>
        <div className="nx-footer-legal">
          <p>© {new Date().getFullYear()} Nexo. Todos os direitos reservados.</p>
          <button
            type="button"
            className="nx-footer-toggle"
            aria-pressed={reduced}
            onClick={() => setReduced(!reduced)}
          >
            {reduced ? "Ativar animações" : "Reduzir animações"}
          </button>
          <a href="/privacidade">Política de privacidade</a>
          <a href="mailto:nexo.bd.owners@gmail.com">nexo.bd.owners@gmail.com</a>
          <CookiePreferencesButton />
          <a href="#inicio">Voltar ao topo</a>
        </div>
      </footer>
    </div>
  );
}
