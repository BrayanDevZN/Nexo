import { ArrowUpRight } from "lucide-react";
import { Picture } from "@/components/home/Picture";
import { contactUrl, solutions } from "@/lib/content";
import { pictures, type Picture as PictureData } from "@/lib/pictures";

// One picture per solution, each from the history of the same job: routing requests, programming
// a repeat task, plugging things together, counting for a business.
const pictureFor: PictureData[] = [
  pictures.exchange,
  pictures.patternCards,
  pictures.switchboard,
  pictures.addingMachine,
];

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
        <article className="nx-row" key={solution.title}>
          <p className="nx-row-tags nx-reveal">{solution.tags.join(" · ")}</p>
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
          <Picture
            picture={pictureFor[index]}
            caption={false}
            className={`nx-reveal nx-photo-${index + 1}`}
          />
        </article>
      ))}
    </section>
  );
}
