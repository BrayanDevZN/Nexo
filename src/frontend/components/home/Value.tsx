import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { contactUrl } from "@/lib/content";

const benefits = [
  {
    title: "Tempo de volta",
    description: "Menos horas em tarefa repetitiva, mais horas no que dá dinheiro.",
    mechanism:
      "A tecnologia organiza informações, prepara respostas e passa dados de um lugar para outro no lugar da sua equipe.",
    impact:
      "Seu time sai do automático e foca em atender bem, resolver problemas e fechar negócio.",
    measurement: "Horas de trabalho manual por mês.",
  },
  {
    title: "Menos erro, menos retrabalho",
    description: "Cada tarefa feita certa na primeira vez.",
    mechanism:
      "Os dados são conferidos no caminho, então menos coisa chega errada, duplicada ou incompleta.",
    impact:
      "Menos correção, menos cliente insatisfeito e menos custo por entrega. E mostramos também quanto a própria solução custa.",
    measurement: "Quantidade de correções e custo por tarefa.",
  },
  {
    title: "Mais clientes sem mais bagunça",
    description: "Atenda mais gente com a equipe que você já tem.",
    mechanism:
      "As tarefas de rotina andam sozinhas e a sua equipe só entra quando precisa de uma pessoa de verdade.",
    impact:
      "Quando a demanda cresce, a empresa acompanha sem que o trabalho manual cresça junto.",
    measurement: "Pedidos atendidos, tempo de resposta e fila de pendências.",
  },
  {
    title: "Informação na mão na hora certa",
    description: "Chega de procurar em mil lugares.",
    mechanism:
      "A equipe encontra o que precisa em segundos e vê o que foi feito em cada caso.",
    impact:
      "Decisões mais rápidas, respostas mais seguras e menos dependência de uma pessoa que sabe tudo.",
    measurement: "Erros, qualidade das respostas e casos que pedem revisão.",
  },
];

const validation = [
  {
    title: "Olhamos como é hoje.",
    text: "Tempo gasto, volume e erros da rotina atual.",
  },
  {
    title: "Testamos em uma tarefa.",
    text: "Começamos pequeno, com regras claras de qualidade.",
  },
  {
    title: "Comparamos e decidimos juntos.",
    text: "Se o ganho compensa o custo, ampliamos. Se não, você sabe antes de gastar mais.",
  },
];

export function Value() {
  return (
    <section
      id="valor"
      className="nx-section nx-wrap nx-value"
      aria-labelledby="value-title"
    >
      <div className="nx-process-head">
        <h2 id="value-title" className="nx-h2 nx-reveal">
          Menos correria.
          <br />
          Mais resultado.
        </h2>
        <p className="nx-lead nx-reveal">
          O que você ganha na prática: tempo de volta, menos erro, mais clientes
          atendidos e informação sempre à mão.
        </p>
      </div>
      {benefits.map((benefit) => (
        <article className="nx-benefit nx-reveal" key={benefit.title}>
          <div>
            <h3 className="nx-h3">{benefit.title}</h3>
            <p className="nx-body nx-soft">{benefit.description}</p>
          </div>
          <div className="nx-benefit-text">
            <p className="nx-body">
              <strong>Como ajuda.</strong> {benefit.mechanism}
            </p>
            <p className="nx-body">
              <strong>O que muda para você.</strong> {benefit.impact}
            </p>
            <p className="nx-body nx-soft">
              <strong>Como você confere.</strong> {benefit.measurement}
            </p>
          </div>
        </article>
      ))}
      <div className="nx-validation nx-reveal">
        <div>
          <h3 className="nx-h3">Você só amplia depois de ver funcionar.</h3>
          <p className="nx-body nx-soft">
            Começamos por uma tarefa e medimos o resultado. O ganho depende do
            tamanho da sua operação, por isso mostramos os números antes de
            você decidir o próximo passo.
          </p>
        </div>
        <ol>
          {validation.map((item) => (
            <li key={item.title}>
              <strong>{item.title}</strong> {item.text}
            </li>
          ))}
        </ol>
      </div>
      <div className="nx-value-cta nx-reveal">
        <p className="nx-lead">Qual processo mais consome tempo da sua equipe?</p>
        <Button size="lg" asChild className="h-auto max-w-full whitespace-normal py-2.5">
          <a href={contactUrl} target="_blank" rel="noopener noreferrer">
            Quero conversar sobre o meu negócio{" "}
            <ArrowUpRight data-icon="inline-end" />
          </a>
        </Button>
      </div>
    </section>
  );
}
