import { FileWarning, MessageCircleQuestion, Repeat } from "lucide-react";
import { campaignOrigin, whatsappLink } from "@/lib/whatsapp";
import { whatsappNumber } from "@/lib/content";

export const landingPage = "contabilidade";
export const landingTitle = "Automação para escritórios de contabilidade | Nexo";
export const landingDescription =
  "A Nexo cria automações sob medida para escritórios de contabilidade: documentos dos clientes organizados e menos trabalho manual para a equipe. Converse com a gente no WhatsApp.";

const message =
  "Olá! Vim pela página de contabilidade da Nexo e quero entender como automatizar a rotina do meu escritório.";

export function landingWhatsappUrl(search: string): string {
  return whatsappLink(whatsappNumber, message, campaignOrigin(search));
}

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
    question: "Quanto custa?",
    answer:
      "Depende do que será automatizado. Na conversa inicial entendemos o escopo e apresentamos uma proposta com valores claros.",
  },
];
