import { IntelligenceCore } from "@/components/IntelligenceCore";
import { MarkSlot } from "@/components/home/MarkSlot";

const principles = [
  {
    title: "Impacto antes da ferramenta",
    text: "O projeto começa com um problema concreto e critérios claros para avaliar a solução.",
  },
  {
    title: "Integração com a realidade",
    text: "Dados, sistemas e pessoas fazem parte da arquitetura. A solução precisa funcionar na rotina.",
  },
  {
    title: "Autonomia com controle",
    text: "Regras, rastreabilidade e pontos de revisão humana definidos para cada processo.",
  },
];

export function About() {
  return (
    <section
      id="sobre"
      className="nx-section nx-wrap nx-about"
      aria-labelledby="about-title"
    >
      <div className="nx-about-main">
        <h2 id="about-title" className="nx-h2 nx-reveal">
          A conexão com o próximo passo.
        </h2>
        <p className="nx-statement nx-reveal">
          <MarkSlot />
          Somos uma agência de inteligência artificial que começa pelo negócio.
          Entendemos como sua empresa funciona, identificamos o que trava a
          operação e construímos soluções para aumentar sua capacidade
          operacional: mais atendimentos, processos e entregas com melhor
          aproveitamento da equipe e dos sistemas existentes.
        </p>
        <div className="nx-principles">
          {principles.map((principle) => (
            <div key={principle.title} className="nx-reveal">
              <h3>{principle.title}</h3>
              <p className="nx-body nx-soft">{principle.text}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="nx-about-core nx-core" aria-hidden="true">
        <IntelligenceCore />
      </div>
    </section>
  );
}
