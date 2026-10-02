import { Clock3, Coins, Gauge, ShieldCheck, ArrowUpRight } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { contactUrl } from "@/lib/content";

const benefits = [
  {
    icon: Clock3,
    title: "Tempo para o que importa",
    label: "TEMPO",
    description: "Menos horas gastas em tarefas repetitivas.",
    mechanism:
      "A IA pode organizar informações, preparar respostas e conectar etapas que hoje dependem de copiar dados manualmente.",
    impact:
      "Sua equipe ganha espaço para atender clientes, resolver exceções e trabalhar nas prioridades do negócio.",
    measurement: "Tempo por tarefa e horas de trabalho manual por mês.",
  },
  {
    icon: Coins,
    title: "Menos desperdício operacional",
    label: "CUSTOS",
    description: "Reduza retrabalho e esforço por entrega.",
    mechanism:
      "Validações e integrações ajudam a evitar registros duplicados, informações incompletas e correções que atravessam várias equipes.",
    impact:
      "O custo de executar um processo pode diminuir quando o tempo e as falhas caem. Consideramos também os custos da solução.",
    measurement:
      "Custo por operação, correções e despesas com modelos e infraestrutura.",
  },
  {
    icon: Gauge,
    title: "Mais capacidade de entrega",
    label: "CAPACIDADE",
    description: "Absorva mais demanda com uma operação melhor organizada.",
    mechanism:
      "Agentes e automações podem preparar tarefas, distribuir solicitações e manter os sistemas atualizados ao longo do fluxo.",
    impact:
      "A equipe consegue dedicar sua atenção às etapas que exigem julgamento, em vez de gastar tempo organizando cada solicitação.",
    measurement:
      "Volume concluído, tempo de resposta e tamanho da fila de pendências.",
  },
  {
    icon: ShieldCheck,
    title: "Decisões com mais contexto",
    label: "QUALIDADE",
    description: "Informações acessíveis e processos rastreáveis.",
    mechanism:
      "Busca em fontes autorizadas, resumos e registros das ações ajudam a equipe a encontrar o que precisa e conferir as informações.",
    impact:
      "Mais consistência na rotina, menos dependência de informações dispersas e maior clareza sobre o que precisa de revisão.",
    measurement:
      "Taxa de erros, qualidade das respostas e casos encaminhados para revisão.",
  },
];

export function BusinessValue() {
  return (
    <section
      id="valor"
      className="section shell value-section"
      aria-labelledby="value-title"
    >
      <div className="section-heading heading-split">
        <div>
          <p className="eyebrow">03 / VALOR PARA SUA EMPRESA</p>
          <h2 id="value-title">
            Mais eficiência.
            <br />
            <span>Mais espaço para crescer.</span>
          </h2>
        </div>
        <p className="section-description">
          O valor está no que melhora na sua operação: tempo recuperado, menos
          retrabalho, mais capacidade e informação útil para decidir.
        </p>
      </div>
      <div className="value-grid">
        {benefits.map((benefit) => (
          <Card key={benefit.label} className="value-card">
            <CardHeader>
              <div className="value-card-top">
                <div className="icon-tile">
                  <benefit.icon aria-hidden="true" />
                </div>
                <Badge variant="secondary">{benefit.label}</Badge>
              </div>
              <CardTitle>
                <h3>{benefit.title}</h3>
              </CardTitle>
              <CardDescription>{benefit.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
              <div>
                <p className="detail-label">COMO A IA CONTRIBUI</p>
                <p className="body-copy">{benefit.mechanism}</p>
              </div>
              <div>
                <p className="detail-label">O QUE ISSO PODE MUDAR</p>
                <p className="body-copy">{benefit.impact}</p>
              </div>
            </CardContent>
            <CardFooter>
              <div>
                <p className="detail-label">COMO MEDIMOS</p>
                <p className="body-copy">{benefit.measurement}</p>
              </div>
            </CardFooter>
          </Card>
        ))}
      </div>
      <div className="value-validation">
        <div>
          <Badge variant="outline">DO POTENCIAL AO RESULTADO</Badge>
          <h3>O ganho precisa ser medido.</h3>
          <p className="body-copy">
            Começamos pelo processo atual, definimos indicadores e validamos um
            primeiro escopo. O retorno depende do volume, dos dados e das
            integrações da empresa.
          </p>
        </div>
        <ol>
          <li>
            <span>01</span>
            <div>
              <strong>Medir a rotina atual</strong>
              <p>Tempo, volume, erros e custo de execução.</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>Validar em um processo</strong>
              <p>Testar a solução com critérios de qualidade e revisão.</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>Comparar e decidir</strong>
              <p>Avaliar o ganho e o custo total antes de ampliar.</p>
            </div>
          </li>
        </ol>
      </div>
      <div className="value-cta">
        <p className="body-copy">
          Qual processo mais consome tempo da sua equipe?
        </p>
        <Button asChild>
          <a href={contactUrl} target="_blank" rel="noopener noreferrer">
            Avaliar o potencial do meu negócio{" "}
            <ArrowUpRight data-icon="inline-end" />
          </a>
        </Button>
      </div>
    </section>
  );
}
