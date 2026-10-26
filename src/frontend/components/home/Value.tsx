import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { contactUrl } from "@/lib/content";

const benefits = [
  {
    title: "Tempo para o que importa",
    description: "Menos horas gastas em tarefas repetitivas.",
    mechanism:
      "A IA pode organizar informações, preparar respostas e conectar etapas que hoje dependem de copiar dados manualmente.",
    impact:
      "Sua equipe ganha espaço para atender clientes, resolver exceções e trabalhar nas prioridades do negócio.",
    measurement: "Tempo por tarefa e horas de trabalho manual por mês.",
  },
  {
    title: "Menos desperdício operacional",
    description: "Reduza retrabalho e esforço por entrega.",
    mechanism:
      "Validações e integrações ajudam a evitar registros duplicados, informações incompletas e correções que atravessam várias equipes.",
    impact:
      "O custo de executar um processo pode diminuir quando o tempo e as falhas caem. Consideramos também os custos da solução.",
    measurement:
      "Custo por operação, correções e despesas com modelos e infraestrutura.",
  },
  {
    title: "Mais capacidade operacional",
    description:
      "Atenda mais clientes e realize mais entregas com os recursos da sua empresa.",
    mechanism:
      "Agentes e automações podem preparar tarefas, distribuir solicitações e manter os sistemas atualizados ao longo do fluxo.",
    impact:
      "Sua empresa pode absorver mais demanda sem aumentar a carga manual na mesma proporção. A equipe se concentra nas exceções e nas etapas que exigem julgamento.",
    measurement:
      "Volume concluído, tempo de resposta e tamanho da fila de pendências.",
  },
  {
    title: "Decisões com mais contexto",
    description: "Informações acessíveis e processos rastreáveis.",
    mechanism:
      "Busca em fontes autorizadas, resumos e registros das ações ajudam a equipe a encontrar o que precisa e conferir as informações.",
    impact:
      "Mais consistência na rotina, menos dependência de informações dispersas e maior clareza sobre o que precisa de revisão.",
    measurement:
      "Taxa de erros, qualidade das respostas e casos encaminhados para revisão.",
  },
];

const validation = [
  {
    title: "Medir a rotina atual.",
    text: "Tempo, volume, erros e custo de execução.",
  },
  {
    title: "Validar em um processo.",
    text: "Testar a solução com critérios de qualidade e revisão.",
  },
  {
    title: "Comparar e decidir.",
    text: "Avaliar o ganho e o custo total antes de ampliar.",
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
          Mais eficiência.
          <br />
          Mais espaço.
        </h2>
        <p className="nx-lead nx-reveal">
          O valor está no que melhora na sua operação: tempo recuperado, menos
          retrabalho, mais capacidade e informação útil para decidir.
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
              <strong>Como a IA contribui.</strong> {benefit.mechanism}
            </p>
            <p className="nx-body">
              <strong>O que isso pode mudar.</strong> {benefit.impact}
            </p>
            <p className="nx-body nx-soft">
              <strong>Como medimos.</strong> {benefit.measurement}
            </p>
          </div>
        </article>
      ))}
      <div className="nx-validation nx-reveal">
        <div>
          <h3 className="nx-h3">O ganho precisa ser medido.</h3>
          <p className="nx-body nx-soft">
            Começamos pelo processo atual, definimos indicadores e validamos um
            primeiro escopo. O retorno depende do volume, dos dados e das
            integrações da empresa.
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
        <Button size="lg" asChild>
          <a href={contactUrl} target="_blank" rel="noopener noreferrer">
            Avaliar o potencial do meu negócio{" "}
            <ArrowUpRight data-icon="inline-end" />
          </a>
        </Button>
      </div>
    </section>
  );
}
