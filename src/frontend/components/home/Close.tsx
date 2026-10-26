import { ArrowUpRight } from "lucide-react";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { useMotionPreferences } from "@/components/MotionProvider";
import { contactUrl, navigation } from "@/lib/content";
import { pictures } from "@/lib/pictures";

const credited = [
  pictures.exchange,
  pictures.patternCards,
  pictures.switchboard,
  pictures.addingMachine,
];

export function Close() {
  const { reduced, setReduced } = useMotionPreferences();
  return (
    <div className="nx-inverse nx-close">
      <section
        id="contato"
        className="nx-wrap nx-cta"
        aria-labelledby="contact-title"
      >
        <h2 id="contact-title" className="nx-display nx-cta-title nx-reveal">
          Vamos encontrar
          <br />o nexo.
        </h2>
        <div className="nx-cta-foot">
          <p className="nx-lead">
            Sua demanda cresceu, mas a operação não acompanha? Vamos
            identificar os gargalos e avaliar como ampliar sua capacidade com IA
            e automação.
          </p>
          <Button size="lg" asChild className="nx-cta-button">
            <a href={contactUrl} target="_blank" rel="noopener noreferrer">
              Vamos encontrar o nexo <ArrowUpRight data-icon="inline-end" />
            </a>
          </Button>
        </div>
      </section>
      <footer className="nx-wrap nx-footer">
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
          <a href="#inicio">Voltar ao topo</a>
        </div>
        <p className="nx-credits">
          Imagens do acervo aberto Wikimedia Commons:{" "}
          {credited.map((picture, index) => (
            <span key={picture.credit.title}>
              {index > 0 ? "; " : ""}
              <a href={picture.credit.page} target="_blank" rel="noopener noreferrer">
                {picture.caption}
              </a>{" "}
              ({picture.credit.author}, {picture.credit.license})
            </span>
          ))}
          .
        </p>
        <div className="nx-wordmark" aria-hidden="true">
          nexo.
        </div>
      </footer>
    </div>
  );
}
