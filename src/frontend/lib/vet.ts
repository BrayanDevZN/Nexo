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
  "A Nexo assume as tarefas do dia a dia que tomam tempo da sua equipe e fazem a clínica perder clientes. Você não precisa aprender nenhuma ferramenta: a gente implanta, opera e acompanha tudo, e todo mês mostra o resultado.";

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
    summary: "Seus tutores atendidos na hora pelo WhatsApp, inclusive à noite e nos fins de semana.",
    points: [
      "Resposta imediata às dúvidas do dia a dia: horários, valores, serviços, endereço, documentos",
      "Atendimento no tom e com as informações da sua clínica",
      "Quando o assunto é clínico ou precisa de alguém da equipe, a conversa é passada pro veterinário com todo o histórico",
      "Nenhum tutor fica sem resposta",
    ],
    image: "/images/vet/atendimento.jpg",
    alt: "Tutora fazendo carinho em um gato",
  },
  {
    number: "02",
    id: "agendamento",
    title: "Agendamento",
    summary: "Consultas, vacinas, banho e tosa e retornos marcados direto pelo WhatsApp.",
    points: [
      "Sistema de agendamento próprio da Nexo, simples, com a agenda de cada profissional",
      "Se a sua clínica já usa um sistema, a Nexo trabalha junto com ele",
      "Confirmação automática na véspera e remarcação pelo próprio WhatsApp, pra reduzir faltas",
    ],
    image: "/images/vet/agendamento.jpg",
    alt: "Um corgi e um cachorro peludo correndo juntos em uma estrada",
  },
  {
    number: "03",
    id: "lembretes",
    title: "Lembretes de cuidado",
    summary: "Seus clientes voltando na data certa.",
    points: [
      "Lembrete de vacinas, vermífugos, antipulgas e retornos, com o nome do pet",
      "As datas seguem o protocolo definido pela sua clínica",
      "O tutor responde e já agenda na mesma conversa",
      "Se ele não responder, a Nexo lembra de novo",
    ],
    image: "/images/vet/lembretes.jpg",
    alt: "Frascos e ampolas de vacina sobre uma bancada",
  },
  {
    number: "04",
    id: "acompanhamento",
    title: "Acompanhamento dos animais",
    summary: "O tutor se sente cuidado mesmo depois que sai da clínica.",
    points: [
      "Mensagens nos dias seguintes a cirurgias e procedimentos perguntando como o animal está",
      "Recebimento de fotos e relatos do tutor, encaminhados ao veterinário quando ele pedir",
      "Envio das orientações pós-cirúrgicas escritas pela sua equipe",
      "Aviso quando o resultado de um exame fica pronto, com convite pra agendar o retorno com o veterinário",
    ],
    note: "A Nexo não dá diagnóstico nem orientação clínica: toda informação de saúde vem do veterinário.",
    image: "/images/vet/acompanhamento.jpg",
    alt: "Cachorro pug com colar elizabetano de recuperação",
  },
  {
    number: "05",
    id: "avaliacoes",
    title: "Avaliações no Google",
    summary: "Mais avaliações e uma reputação bem cuidada.",
    points: [
      "Pedido de avaliação a todos os tutores depois do atendimento",
      "Respostas às avaliações, positivas e negativas, de forma profissional e no tom da clínica",
      "Acompanhamento da nota e dos comentários",
    ],
    image: "/images/vet/avaliacoes.jpg",
    alt: "Cachorro beagle sorrindo para a câmera",
  },
  {
    number: "06",
    id: "financeiro",
    title: "Financeiro",
    summary: "Você sabe o que dá lucro na sua clínica.",
    points: [
      "Organização das vendas e dos custos por serviço: consultas, vacinas, cirurgias, banho e tosa, farmácia e produtos",
      "Lucro por serviço, mostrando o que sustenta a clínica e o que dá prejuízo",
      "Faturamento, ticket médio e evolução mês a mês",
    ],
    image: "/images/vet/financeiro.jpg",
    alt: "Cachorro de óculos lendo uma revista",
  },
  {
    number: "07",
    id: "estoque",
    title: "Gestão de estoque",
    summary: "Menos perda e nada faltando na hora errada.",
    points: [
      "Controle de medicamentos, vacinas e produtos",
      "Alerta de itens perto do vencimento",
      "Aviso de estoque baixo pra reposição",
    ],
    image: "/images/vet/estoque.jpg",
    alt: "Cartelas de medicamentos de várias cores",
  },
  {
    number: "08",
    id: "relatorios",
    title: "Relatórios",
    summary: "Todo mês, um relatório simples e claro com:",
    points: [
      "Tutores atendidos e tempo de resposta",
      "Lembretes enviados e retornos recuperados em reais",
      "Consultas agendadas e faltas evitadas",
      "Avaliações recebidas",
      "Lucro por serviço, faturamento e alertas de estoque",
    ],
    image: "/images/vet/relatorios.jpg",
    alt: "Um gato e um cachorro deitados juntos na grama",
  },
];

export const steps = [
  { title: "Conversa de 20 minutos", text: "pra entender a rotina da sua clínica." },
  { title: "Implantação", text: "com as informações e o jeito de atender da clínica." },
  { title: "30 dias de teste", text: "sem custo." },
  { title: "Relatório com o resultado", text: "e você decide se continua." },
];

/** Round photos floating around the hero podium, and the strip before the contact button. */
export const heroPhotos = {
  left: [
    { src: "/images/vet/hero-gato.jpg", alt: "Gato de olhos verdes apoiado em uma madeira", cls: "vt-orb-a" },
    { src: "/images/vet/hero-vacina.jpg", alt: "Ampolas de vacina", cls: "vt-orb-b" },
  ],
  right: [
    { src: "/images/vet/hero-filhote.jpg", alt: "Filhote de golden retriever correndo", cls: "vt-orb-c" },
    { src: "/images/vet/hero-gatinho.jpg", alt: "Gatinho levantando a pata", cls: "vt-orb-d" },
  ],
  podium: [
    { src: "/images/vet/hero-beagle.jpg", alt: "Beagle sorrindo", cls: "vt-orb-e" },
    { src: "/images/vet/hero-pug.jpg", alt: "Pug com colar de recuperação", cls: "vt-orb-f" },
  ],
};

export const strip = [
  "hero-beagle", "hero-gato", "hero-filhote", "hero-vacina", "hero-gatinho", "hero-pug", "hero-corgi",
].map((name) => `/images/vet/${name}.jpg`);
