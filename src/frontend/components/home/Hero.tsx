import { ArrowDown, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkSlot } from "@/components/home/MarkSlot";
import { Picture } from "@/components/home/Picture";
import { contactUrl } from "@/lib/content";
import { pictures } from "@/lib/pictures";

export function Hero() {
  return (
    <section
      id="inicio"
      className="nx-hero nx-wrap"
      aria-labelledby="hero-title"
    >
      <h1
        id="hero-title"
        className="nx-display"
        aria-label="Mais capacidade. Esse é o nexo."
      >
        <span aria-hidden="true">Mais capacidade.</span>
        <span aria-hidden="true">
          Esse é o <MarkSlot />
          exo.
        </span>
      </h1>
      <div className="nx-hero-grid">
      <div className="nx-hero-foot">
        <p className="nx-lead">
          Menos gargalos: conectamos seus sistemas com IA e automação para a
          sua equipe atender mais clientes e fazer mais entregas.
        </p>
        <div className="nx-actions">
          <Button size="lg" asChild>
            <a href={contactUrl} target="_blank" rel="noopener noreferrer">
              Ampliar minha operação <ArrowUpRight data-icon="inline-end" />
            </a>
          </Button>
          <Button variant="ghost" size="lg" asChild>
            <a href="#solucoes">
              Explorar soluções <ArrowDown data-icon="inline-end" />
            </a>
          </Button>
        </div>
      </div>
      <Picture picture={pictures.abacus} eager className="nx-hero-photo nx-reveal" />
      </div>
    </section>
  );
}
