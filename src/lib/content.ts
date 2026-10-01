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
  { href: "#demonstracao", label: "Na prática" },
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
    includes: [
      "Consulta a documentos e bases internas com referências para conferência.",
      "Uso de ferramentas para buscar informações, registrar solicitações e encaminhar tarefas.",
      "Limites de autonomia, passagem para um responsável e histórico das ações.",
    ],
    example:
      "Um agente recebe uma solicitação, consulta o histórico do cliente e prepara o atendimento com o contexto necessário.",
  },
  {
    icon: Workflow,
    number: "02",
    title: "Automação inteligente",
    description:
      "Fluxos que conectam etapas, organizam documentos e reduzem o trabalho repetitivo entre diferentes equipes.",
    tags: ["Documentos", "Operações", "Workflows"],
    includes: [
      "Recebimento, extração e classificação de informações de arquivos e mensagens.",
      "Regras de validação, encaminhamento de exceções e aprovações entre etapas.",
      "Integração de rotinas que hoje exigem copiar dados e alternar entre sistemas.",
    ],
    example:
      "Documentos recebidos por e-mail viram registros organizados, com divergências separadas para a equipe revisar.",
  },
  {
    icon: Cable,
    number: "03",
    title: "IA nos seus sistemas",
    description:
      "Inteligência artificial integrada ao que você já usa. Seus dados, ERPs e CRMs trabalhando juntos.",
    tags: ["APIs", "ERP e CRM", "Busca inteligente"],
    includes: [
      "Conexão com sistemas existentes, conforme disponibilidade de APIs e acesso aos dados.",
      "Busca, classificação, resumos e análise de informações dentro dos fluxos atuais.",
      "Permissões, tratamento de falhas e rastreabilidade das integrações.",
    ],
    example:
      "Uma atualização no CRM inicia um fluxo que reúne dados, prepara um resumo e encaminha a próxima ação ao responsável.",
  },
  {
    icon: Blocks,
    number: "04",
    title: "Software sob medida",
    description:
      "Do desenho da arquitetura à aplicação em produção, construímos a solução que o seu processo precisa.",
    tags: ["Backend", "Dados", "Infraestrutura"],
    includes: [
      "Arquitetura, APIs e estrutura de dados desenhadas para as regras do negócio.",
      "Interfaces e fluxos próprios quando ferramentas prontas não resolvem o problema.",
      "Testes, implantação, documentação e acompanhamento conforme o escopo contratado.",
    ],
    example:
      "Um sistema interno centraliza solicitações, conecta a IA e permite que a equipe acompanhe cada etapa da operação.",
  },
];
export const steps = [
  {
    icon: ScanSearch,
    title: "Entender o negócio",
    text: "Mapeamos processos, ferramentas e tarefas para identificar onde o tempo e o dinheiro estão sendo consumidos.",
    delivery: "Diagnóstico e oportunidades",
    details: [
      "Levantamento de etapas, volumes e responsáveis",
      "Identificação de retrabalho e tempo de execução",
      "Priorização por impacto e viabilidade",
    ],
  },
  {
    icon: Network,
    title: "Arquitetar a solução",
    text: "Priorizamos o problema, avaliamos a viabilidade e desenhamos o fluxo, as integrações e os critérios de sucesso.",
    delivery: "Escopo e plano de implementação",
    details: [
      "Fluxo proposto e integrações necessárias",
      "Regras, acessos e pontos de aprovação",
      "Estimativa de investimento e critérios de aceite",
    ],
  },
  {
    icon: Rocket,
    title: "Construir e integrar",
    text: "Desenvolvemos, testamos com cenários reais e conectamos a solução aos sistemas e à rotina da sua equipe.",
    delivery: "Solução pronta para operar",
    details: [
      "Desenvolvimento e validação com amostras reais",
      "Testes de falhas, exceções e permissões",
      "Implantação e orientação para uso da equipe",
    ],
  },
  {
    icon: Activity,
    title: "Acompanhar e evoluir",
    text: "Com acompanhamento contratado, monitoramos falhas, ajustamos os fluxos e evoluímos a solução com dados reais.",
    delivery: "Monitoramento e melhoria contínua",
    details: [
      "Monitoramento da execução e dos custos",
      "Ajustes a partir de erros e feedbacks",
      "Novas melhorias priorizadas com a operação",
    ],
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
    problem:
      "Arquivos chegam por canais diferentes e a equipe precisa abrir, conferir e digitar as mesmas informações.",
    control:
      "Campos ausentes, divergências e documentos duplicados seguem para uma fila de revisão.",
    measurement:
      "Tempo por documento, quantidade de correções e volume processado pela equipe.",
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
    problem:
      "Contatos ficam espalhados em mensagens, e o time perde tempo reconstruindo o histórico antes de responder.",
    control:
      "Critérios de qualificação e encaminhamento são definidos com o negócio; negociações ficam com a equipe.",
    measurement:
      "Tempo de primeira resposta, completude dos registros e oportunidades sem acompanhamento.",
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
    problem:
      "Procedimentos e documentos estão dispersos, concentrando dúvidas recorrentes em poucas pessoas.",
    control:
      "A busca respeita os acessos definidos e apresenta referências; informações insuficientes são sinalizadas.",
    measurement:
      "Tempo para encontrar respostas, qualidade das referências e dúvidas que exigem intervenção.",
  },
];
export const faqs = [
  {
    question: "Por onde vale a pena começar?",
    answer:
      "Por um processo com volume recorrente, dor clara e dados disponíveis. No diagnóstico, avaliamos o esforço de integração e o potencial de melhoria para propor um primeiro escopo que possa ser validado antes de ampliar.",
  },
  {
    question: "Como vamos saber se a solução trouxe resultado?",
    answer:
      "Definimos indicadores antes da implementação: tempo de execução, retrabalho, taxa de erros, volume atendido e custo por operação, conforme o caso. Comparamos o processo anterior com a operação assistida, sem prometer ganhos que ainda não foram medidos.",
  },
  {
    question: "Como são tratados os dados da empresa?",
    answer:
      "O projeto define quais dados serão usados, quem pode acessá-los, quais serviços os processam e como serão armazenados. Essas decisões, incluindo permissões e retenção, fazem parte da arquitetura e do escopo acordado.",
  },
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
