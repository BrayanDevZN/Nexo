import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { steps } from "@/lib/content";

const lead = [
  "Primeiro, entendemos o negócio.",
  "Depois, arquitetamos a solução.",
  "Então construímos e integramos.",
  "E seguimos evoluindo.",
];

export function Process() {
  return (
    <section
      id="processo"
      className="nx-section nx-band"
      aria-labelledby="process-title"
    >
      <div className="nx-wrap">
        <div className="nx-process-head">
          <h2 id="process-title" className="nx-h2 nx-reveal">
            Primeiro o problema.
            <br />
            Depois, a tecnologia.
          </h2>
          <p className="nx-lead nx-reveal">
            Do diagnóstico à solução em produção: um caminho claro entre
            entender a sua operação e colocar uma solução para trabalhar.
          </p>
        </div>
        <ol className="nx-stages">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="nx-stage nx-reveal"
              style={{ "--stage": index } as React.CSSProperties}
            >
              <Card className="nx-stage-card h-full">
                <CardHeader>
                  <Badge variant="secondary" className="nx-step-badge">
                    {String(index + 1).padStart(2, "0")}
                  </Badge>
                  <h3>{lead[index]}</h3>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <p className="nx-body">{step.text}</p>
                  <p className="nx-body nx-soft">
                    <strong>Entrega.</strong> {step.delivery}.{" "}
                    {step.details.join("; ")}.
                  </p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
