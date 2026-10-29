import { ArrowUpRight } from "lucide-react";
import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Art, type ArtName } from "@/components/home/Art";
import { contactUrl, solutions } from "@/lib/content";

// One picture per solution, each from the history of the same job: routing requests, programming
// a repeat task, plugging things together, counting for a business.
const artFor: ArtName[] = ["agent", "flow", "systems", "custom"];

export function Features() {
  return (
    <section
      id="solucoes"
      className="nx-section nx-wrap nx-features"
      aria-labelledby="features-title"
    >
      <div className="nx-features-head">
        <h2 id="features-title" className="nx-h2 nx-reveal">
          IA onde o trabalho
          <br />
          realmente acontece.
        </h2>
        <p className="nx-lead nx-reveal">
          Construímos agentes e automações para reduzir gargalos, acelerar
          processos e ampliar o volume de trabalho que sua empresa consegue
          realizar.
        </p>
      </div>
      {solutions.map((solution, index) => (
        <Fragment key={solution.title}>
        {index > 0 && <Separator className="nx-rule" />}
        <article className="nx-row">
          <ul className="nx-row-tags nx-reveal" aria-label="Temas">
            {solution.tags.map((tag) => (
              <li key={tag}>
                <Badge variant="secondary">{tag}</Badge>
              </li>
            ))}
          </ul>
          <div className="nx-row-body nx-reveal">
            <h3 className="nx-h3">{solution.title}</h3>
            <p className="nx-body">{solution.description}</p>
            <ul className="nx-list">
              {solution.includes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="nx-body nx-soft">
              <strong>Na rotina.</strong> {solution.example}
            </p>
            <a
              className="nx-link"
              href={contactUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Explorar essa possibilidade <ArrowUpRight aria-hidden="true" />
            </a>
          </div>
          <Art name={artFor[index]} className="nx-reveal" />
        </article>
        </Fragment>
      ))}
    </section>
  );
}
