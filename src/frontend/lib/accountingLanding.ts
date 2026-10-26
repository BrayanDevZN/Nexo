import { FileWarning, MessageCircleQuestion, Repeat } from "lucide-react";
import { campaignOrigin, whatsappLink } from "@/lib/whatsapp";
import { whatsappNumber } from "@/lib/content";

export const landingPage = "contabilidade";
export const landingTitle = "Automação para escritórios de contabilidade | Nexo";
export const landingDescription =
  "A Nexo cria agentes de IA para escritórios de contabilidade: agentes de atendimento que respondem os clientes, agentes que ajudam na rotina contábil e automações que organizam os documentos. Converse com a gente no WhatsApp.";

const message =
  "Olá! Vim pela página de contabilidade da Nexo e quero entender como automatizar a rotina do meu escritório.";

export function landingWhatsappUrl(search: string): string {
  return whatsappLink(whatsappNumber, message, campaignOrigin(search));
}

export const solutions = [
  {
    title: "Agentes de atendimento",
    art: "whatsapp",
    text: "Um agente de IA responde os clientes do escritório pelo WhatsApp: vencimentos, guias, andamento e documentos que faltam. O que exige julgamento vai para o seu contador, com o histórico da conversa.",
    points: [
      "Respostas sobre prazos, guias e pendências, no tom do escritório.",
      "Pedido de documentos e lembretes sem ninguém precisar cobrar.",
      "Encaminhamento para a equipe quando a dúvida é técnica.",
    ],
  },
  {
    title: "Agentes para a contabilidade",
    art: "ledger",
    text: "Agentes feitos para o dia a dia contábil: leem extratos e notas, comparam com os lançamentos, apontam diferenças e preparam o resumo para conferência. A decisão final é sempre do contador.",
    points: [
      "Leitura e classificação de extratos, notas e comprovantes.",
      "Comparação com os lançamentos e destaque das divergências.",
      "Resumo pronto para conferir antes do registro final.",
    ],
  },
  {
    title: "Documentos organizados",
    art: "docs",
    text: "Os arquivos que chegam soltos viram uma pasta por cliente e por período. Quem ainda não enviou recebe o lembrete sozinho, e a equipe vê num só lugar o que falta.",
    points: [
      "Recebimento por WhatsApp e e-mail, sem copiar e colar.",
      "Separação por cliente, mês e tipo de documento.",
      "Painel simples com o que está completo e o que está pendente.",
    ],
  },
  {
    title: "Ligado ao seu sistema contábil",
    art: "systems",
    text: "Os agentes e as rotinas se conectam às ferramentas que o escritório já usa, conforme o que cada sistema permite. Nada de trocar o que já funciona.",
    points: [
      "Avaliação de cada sistema na conversa inicial.",
      "Integração só com os dados autorizados.",
      "Histórico das ações para auditoria da equipe.",
    ],
  },
] as const;

export const benefits = [
  { title: "Tempo de volta para a equipe", text: "Menos horas em cobrança, conferência manual e respostas repetidas." },
  { title: "Clientes atendidos mais rápido", text: "Dúvidas simples respondidas na hora, inclusive fora do expediente." },
  { title: "Menos erro de digitação", text: "Documentos lidos e comparados antes de chegarem ao registro." },
  { title: "Controle com o contador", text: "Cada agente tem regras, histórico e pontos de revisão humana." },
];

export const principles = [
  { title: "Começamos pela sua rotina", text: "Antes de qualquer ferramenta, mapeamos onde a equipe perde tempo." },
  { title: "O contador decide", text: "Os agentes preparam e sugerem. Aprovação e responsabilidade ficam com o escritório." },
  { title: "Cresce em etapas", text: "Um processo por vez, medido, antes de ampliar para o resto do escritório." },
];

export const outcomes = [
  "Menos trabalho manual",
  "Documentos organizados",
  "Equipe focada no que exige análise",
];

export const problems = [
  {
    icon: FileWarning,
    title: "Documentos soltos no WhatsApp",
    text: "Notas, extratos e comprovantes chegam em mensagens avulsas, e alguém precisa organizar tudo.",
  },
  {
    icon: Repeat,
    title: "Cobrança de pendências todo mês",
    text: "A equipe gasta tempo lembrando cada cliente do que ainda falta enviar.",
  },
  {
    icon: MessageCircleQuestion,
    title: "As mesmas perguntas, todo dia",
    text: "Vencimentos, guias e andamento ocupam o atendimento com respostas repetitivas.",
  },
];

export const steps = [
  {
    title: "Conversa inicial",
    text: "Você conta como o escritório trabalha hoje. Em 20 minutos mapeamos onde está o trabalho repetitivo.",
  },
  {
    title: "Desenho da automação",
    text: "Propomos o que automatizar, o que continua com a equipe e onde entra a revisão humana.",
  },
  {
    title: "Teste e ajuste",
    text: "A automação entra em operação de forma acompanhada e é ajustada com base no uso real.",
  },
];

/** Same scenario the site already shows on the home page ("Contabilidade conectada"). */
export const flow = [
  { label: "Receber", text: "Extratos e notas organizados." },
  { label: "Interpretar", text: "Lançamentos comparados com o extrato." },
  { label: "Validar", text: "Diferença de valor enviada para revisão." },
  { label: "Preparar", text: "Resumo financeiro pronto para conferência." },
];

export const fit = {
  yes: [
    "Escritórios que recebem muitos documentos dos clientes todo mês.",
    "Equipes que atendem clientes pelo WhatsApp com perguntas recorrentes.",
    "Donos que querem reduzir o trabalho repetitivo da equipe.",
  ],
  no: [
    "Não é um sistema contábil nem um chatbot de prateleira.",
    "Cada automação é desenhada para a rotina do seu escritório.",
    "A decisão final continua com a sua equipe.",
  ],
};

export const faqs = [
  {
    question: "Funciona com o sistema contábil que eu já uso?",
    answer:
      "Depende do sistema. Na conversa inicial entendemos quais ferramentas você usa e dizemos com franqueza o que dá para conectar.",
  },
  {
    question: "Os dados dos meus clientes ficam seguros?",
    answer:
      "Definimos com você quais informações a automação acessa, com pontos de revisão humana e histórico das ações. Os cuidados com LGPD e o contrato são combinados antes de começar.",
  },
  {
    question: "Como o WhatsApp entra na automação?",
    answer:
      "Isso é definido no projeto. Avaliamos com você a melhor forma de usar o WhatsApp, respeitando as regras da plataforma.",
  },
  {
    question: "O agente responde o cliente sozinho?",
    answer:
      "Ele responde o que for definido junto com você, como prazos, guias e pendências. Dúvidas técnicas ou fora do combinado vão para a equipe, com o histórico da conversa.",
  },
  {
    question: "Preciso trocar meu sistema contábil?",
    answer:
      "Não. Os agentes se conectam ao que o escritório já usa, conforme a disponibilidade de cada ferramenta.",
  },
  {
    question: "Em quanto tempo começa a funcionar?",
    answer:
      "Depende do que será feito. Começamos por um processo, testamos com acompanhamento e só depois ampliamos. O prazo é combinado na proposta.",
  },
  {
    question: "Quanto custa?",
    answer:
      "Depende do que será automatizado. Na conversa inicial entendemos o escopo e apresentamos uma proposta com valores claros.",
  },
];
