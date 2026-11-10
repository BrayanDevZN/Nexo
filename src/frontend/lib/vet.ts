import { contactUrl } from "@/lib/content";

export { contactUrl };

export const navigation = [
  { href: "#inicio", label: "Início" },
  { href: "#servicos", label: "Serviços" },
  { href: "#como-comecamos", label: "Como começamos" },
  { href: "#contato", label: "Contato" },
];

export const heroLine = "atendimento | agendamento | lembretes | financeiro";
export const lead = "A Nexo cuida dos seus clientes e dos seus números, pra você cuidar dos animais.";
export const intro =
  "A Nexo assume as tarefas do dia a dia que tomam tempo da sua equipe e fazem a clínica perder clientes. Você não precisa aprender nenhuma ferramenta: a gente implanta, opera e acompanha tudo, e todo mês mostra o resultado. Sua equipe continua focada nos animais e nos tutores, e a Nexo cuida do resto, no jeito e no tom da sua clínica.";

export type VetService = {
  number: string;
  id: string;
  title: string;
  summary: string;
  points: string[];
  note?: string;
  image: string;
  alt: string;
};

export const services: VetService[] = [
  {
    number: "01",
    id: "atendimento",
    title: "Atendimento da clínica",
    summary: "Seus tutores atendidos na hora pelo WhatsApp, inclusive à noite e nos fins de semana, sem a recepção precisar parar o que está fazendo.",
    points: [
      "Resposta imediata às dúvidas do dia a dia: horários, valores, serviços, endereço, documentos",
      "Atendimento no tom e com as informações da sua clínica",
      "Quando o assunto é clínico ou precisa de alguém da equipe, a conversa é passada pro veterinário com todo o histórico",
      "Nenhum tutor fica sem resposta",
      "Você acompanha as conversas e ajusta como a clínica quer ser atendida",
    ],
    image: "/images/vet/atendimento",
    alt: "Recepcionista sorrindo enquanto atende uma ligação",
  },
  {
    number: "02",
    id: "agendamento",
    title: "Agendamento",
    summary: "Consultas, vacinas, banho e tosa e retornos marcados direto pelo WhatsApp, sem troca de mensagens para achar um horário.",
    points: [
      "Sistema de agendamento próprio da Nexo, simples, com a agenda de cada profissional",
      "Se a sua clínica já usa um sistema, a Nexo trabalha junto com ele",
      "Confirmação automática na véspera e remarcação pelo próprio WhatsApp, pra reduzir faltas",
      "Horários livres oferecidos ao tutor na hora, respeitando a agenda de cada profissional",
    ],
    image: "/images/vet/agendamento",
    alt: "Agenda aberta em um calendário de setembro com as datas marcadas",
  },
  {
    number: "03",
    id: "lembretes",
    title: "Lembretes de cuidado",
    summary: "Seus clientes voltando na data certa, sem a sua equipe precisar lembrar de cada um.",
    points: [
      "Lembrete de vacinas, vermífugos, antipulgas e retornos, com o nome do pet",
      "As datas seguem o protocolo definido pela sua clínica",
      "O tutor responde e já agenda na mesma conversa",
      "Se ele não responder, a Nexo lembra de novo",
      "Cada retorno que volta é consulta na agenda e receita para a clínica",
    ],
    image: "/images/vet/lembretes",
    alt: "Corgi cercado de corações de papel",
  },
  {
    number: "04",
    id: "acompanhamento",
    title: "Acompanhamento dos animais",
    summary: "O tutor se sente cuidado mesmo depois que sai da clínica, e isso faz ele confiar e voltar.",
    points: [
      "Mensagens nos dias seguintes a cirurgias e procedimentos perguntando como o animal está",
      "Recebimento de fotos e relatos do tutor, encaminhados ao veterinário quando ele pedir",
      "Envio das orientações pós-cirúrgicas escritas pela sua equipe",
      "Aviso quando o resultado de um exame fica pronto, com convite pra agendar o retorno com o veterinário",
    ],
    note: "A Nexo não dá diagnóstico nem orientação clínica: toda informação de saúde vem do veterinário.",
    image: "/images/vet/acompanhamento",
    alt: "Cachorro pug com colar elizabetano de recuperação",
  },
  {
    number: "05",
    id: "avaliacoes",
    title: "Avaliações no Google",
    summary: "Mais avaliações e uma reputação bem cuidada, para quem procura uma clínica na sua região encontrar a sua.",
    points: [
      "Pedido de avaliação a todos os tutores depois do atendimento",
      "Respostas às avaliações, positivas e negativas, de forma profissional e no tom da clínica",
      "Acompanhamento da nota e dos comentários",
      "Tutores satisfeitos convidados a contar a experiência, no momento certo",
    ],
    image: "/images/vet/avaliacoes",
    alt: "Cachorro beagle sorrindo para a câmera",
  },
  {
    number: "06",
    id: "financeiro",
    title: "Financeiro",
    summary: "Você sabe o que dá lucro na sua clínica e decide com número, não com palpite.",
    points: [
      "Organização das vendas e dos custos por serviço: consultas, vacinas, cirurgias, banho e tosa, farmácia e produtos",
      "Lucro por serviço, mostrando o que sustenta a clínica e o que dá prejuízo",
      "Faturamento, ticket médio e evolução mês a mês",
      "Visão simples, sem planilha complicada e sem você precisar entender de contabilidade",
    ],
    image: "/images/vet/financeiro",
    alt: "Cachorro de óculos lendo uma revista",
  },
  {
    number: "07",
    id: "estoque",
    title: "Gestão de estoque",
    summary: "Menos perda e nada faltando na hora errada, com o estoque sempre à vista.",
    points: [
      "Controle de medicamentos, vacinas e produtos",
      "Alerta de itens perto do vencimento",
      "Aviso de estoque baixo pra reposição",
      "Menos medicamento e vacina perdidos por vencimento, e menos dinheiro parado na prateleira",
    ],
    image: "/images/vet/estoque",
    alt: "Cartelas de medicamentos de várias cores",
  },
  {
    number: "08",
    id: "relatorios",
    title: "Relatórios",
    summary: "Todo mês, um relatório simples e claro, para você enxergar o que a Nexo fez pela clínica, com:",
    points: [
      "Tutores atendidos e tempo de resposta",
      "Lembretes enviados e retornos recuperados em reais",
      "Consultas agendadas e faltas evitadas",
      "Avaliações recebidas",
      "Lucro por serviço, faturamento e alertas de estoque",
      "Comparação com o mês anterior, pra ver o que melhorou",
    ],
    image: "/images/vet/relatorios",
    alt: "Um gato e um cachorro deitados juntos na grama",
  },
];

export const steps = [
  { title: "Conversa de 20 minutos", text: "pra entender a rotina da sua clínica, os serviços e onde o tempo está sendo perdido." },
  { title: "Implantação", text: "com as informações, os preços e o jeito de atender da clínica. A Nexo cuida de tudo, sem trabalho para a sua equipe." },
  { title: "30 dias de teste", text: "sem custo, com a Nexo funcionando de verdade na sua rotina." },
  { title: "Relatório com o resultado", text: "mostrando o que mudou, e você decide se continua, sem compromisso." },
];

/** Round photos floating around the hero podium, and the strip before the contact button. */
export const heroPhotos = {
  left: [
    { src: "/images/vet/hero-gato", alt: "Gato de olhos verdes apoiado em uma madeira", cls: "vt-orb-a" },
    { src: "/images/vet/hero-vacina", alt: "Ampolas de vacina", cls: "vt-orb-b" },
  ],
  right: [
    { src: "/images/vet/hero-filhote", alt: "Filhote de golden retriever correndo", cls: "vt-orb-c" },
    { src: "/images/vet/hero-gatinho", alt: "Gatinho levantando a pata", cls: "vt-orb-d" },
  ],
  podium: [
    { src: "/images/vet/hero-beagle", alt: "Beagle sorrindo", cls: "vt-orb-e" },
    { src: "/images/vet/hero-pug", alt: "Pug com colar de recuperação", cls: "vt-orb-f" },
  ],
};

export const strip = [
  "hero-beagle", "hero-gato", "hero-filhote", "hero-vacina", "hero-gatinho", "hero-pug", "hero-corgi",
].map((name) => `/images/vet/${name}`);

/** Photos ship as WebP in two widths; the browser downloads only the one the screen needs. */
export const photoSrcSet = (base: string, widths: readonly number[], ext: "webp" | "avif" = "webp") => widths.map((width) => `${base}-${width}.${ext} ${width}w`).join(", ");
export const SERVICE_WIDTHS = [640, 1200] as const;
export const ORB_WIDTHS = [240, 480] as const;
