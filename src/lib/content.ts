import {
  Bot,
  Workflow,
  Cable,
  Blocks,
  ScanSearch,
  Network,
  Rocket,
  Activity,
} from "lucide-react";

export const contactUrl = `https://wa.me/553196447823?text=${encodeURIComponent("Olá! Conheci a Nexo pelo site e quero avaliar como aplicar Inteligência Artificial na minha empresa.")}`;
export const navigation = [
  { href: "#solucoes", label: "Soluções" },
  { href: "#processo", label: "Como funciona" },
  { href: "#sobre", label: "A Nexo" },
];
export const solutions = [
  {
    icon: Bot,
    number: "01",
    title: "Agentes de IA",
    description:
      "Agentes que entendem contexto, consultam informações e executam tarefas conectados às ferramentas da sua empresa.",
    tags: ["Atendimento", "Conhecimento interno", "Uso de ferramentas"],
  },
  {
    icon: Workflow,
    number: "02",
    title: "Automação inteligente",
    description:
      "Fluxos que conectam etapas, organizam documentos e reduzem o trabalho repetitivo entre diferentes equipes.",
    tags: ["Documentos", "Operações", "Workflows"],
  },
  {
    icon: Cable,
    number: "03",
    title: "IA nos seus sistemas",
    description:
      "Inteligência artificial integrada ao que você já usa. Seus dados, ERPs e CRMs trabalhando juntos.",
    tags: ["APIs", "ERP e CRM", "Busca inteligente"],
  },
  {
    icon: Blocks,
    number: "04",
    title: "Software sob medida",
    description:
      "Do desenho da arquitetura à aplicação em produção, construímos a solução que o seu processo precisa.",
    tags: ["Backend", "Dados", "Infraestrutura"],
  },
];
export const steps = [
  {
    icon: ScanSearch,
    title: "Entender o negócio",
    text: "Mapeamos processos, ferramentas e tarefas para identificar onde o tempo e o dinheiro estão sendo consumidos.",
    delivery: "Diagnóstico e oportunidades",
  },
  {
    icon: Network,
    title: "Arquitetar a solução",
    text: "Priorizamos o problema, avaliamos a viabilidade e desenhamos o fluxo, as integrações e os critérios de sucesso.",
    delivery: "Escopo e plano de implementação",
  },
  {
    icon: Rocket,
    title: "Construir e integrar",
    text: "Desenvolvemos, testamos com cenários reais e conectamos a solução aos sistemas e à rotina da sua equipe.",
    delivery: "Solução pronta para operar",
  },
  {
    icon: Activity,
    title: "Acompanhar e evoluir",
    text: "Com acompanhamento contratado, monitoramos falhas, ajustamos os fluxos e evoluímos a solução com dados reais.",
    delivery: "Monitoramento e melhoria contínua",
  },
];
export const cases = [
  {
    id: "operacoes",
    label: "Operações",
    title: "Do documento à ação.",
    description:
      "Transforme arquivos que chegam por e-mail em informações organizadas e próximas ações, com revisão nas etapas que exigem julgamento humano.",
    input: "Documentos recebidos",
    action: "Extração e classificação",
    output: "Dados no sistema + revisão",
    benefit: "Menos digitação. Mais rastreabilidade.",
  },
  {
    id: "comercial",
    label: "Comercial",
    title: "Cada oportunidade no fluxo certo.",
    description:
      "Organize contatos, entenda a necessidade inicial e direcione oportunidades para a equipe, mantendo o CRM atualizado.",
    input: "Novo contato",
    action: "Qualificação e contexto",
    output: "CRM atualizado + responsável",
    benefit: "Menos informações perdidas entre equipes.",
  },
  {
    id: "conhecimento",
    label: "Conhecimento",
    title: "O conhecimento da empresa, acessível.",
    description:
      "Conecte documentos e procedimentos a uma busca com IA que encontra informações e apresenta as fontes para sua equipe conferir.",
    input: "Pergunta da equipe",
    action: "Busca na base interna",
    output: "Resposta com referências",
    benefit: "Menos tempo procurando. Mais contexto para agir.",
  },
];
export const faqs = [
  {
    question: "Preciso saber qual IA ou ferramenta usar?",
    answer:
      "Não. Você traz o processo e o problema. A Nexo avalia a viabilidade, identifica onde IA faz sentido e define a arquitetura, as ferramentas e as integrações adequadas.",
  },
  {
    question: "A solução funciona com os sistemas que já utilizo?",
    answer:
      "Avaliamos as APIs, os dados e as possibilidades de integração de cada sistema durante o diagnóstico. O escopo é definido a partir do que é tecnicamente viável na sua operação.",
  },
  {
    question: "Como é definido o investimento?",
    answer:
      "Cada projeto recebe um orçamento conforme o escopo, a complexidade, as integrações e a infraestrutura. Custos recorrentes de modelos, serviços e acompanhamento são considerados na proposta.",
  },
  {
    question: "O que acontece depois da entrega?",
    answer:
      "Podemos contratar um acompanhamento para monitorar a solução, corrigir falhas e ajustar os fluxos. Novas funcionalidades e mudanças de escopo são avaliadas e orçadas separadamente.",
  },
  {
    question: "A IA toma todas as decisões sozinha?",
    answer:
      "O grau de autonomia depende do processo. Definimos regras, limites, registros e pontos de aprovação humana para as etapas que precisam de conferência.",
  },
];
