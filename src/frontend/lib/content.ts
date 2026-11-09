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

export const whatsappNumber = "553199705688";
export const contactUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent("Olá! Conheci a Nexo pelo site e quero avaliar como aplicar Inteligência Artificial na minha empresa.")}`;
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
    title: "Atendente que não dorme",
    description:
      "Um assistente que responde seus clientes na hora, com o que a sua empresa realmente sabe, e chama uma pessoa quando precisa.",
    tags: ["Atendimento", "Vendas", "Dúvidas do dia a dia"],
    includes: [
      "Responde perguntas com base nos seus próprios documentos e preços.",
      "Registra o pedido e passa para o responsável certo, sem ninguém copiar e colar.",
      "Você define até onde ele decide sozinho e vê tudo o que ele fez.",
    ],
    example:
      "O cliente pergunta às 22h. Ele responde, anota o pedido e deixa pronto para a equipe confirmar de manhã.",
  },
  {
    icon: Workflow,
    number: "02",
    title: "Fim do trabalho repetitivo",
    description:
      "Tarefas que sua equipe faz todo dia, do mesmo jeito, passam a acontecer sozinhas.",
    tags: ["Documentos", "Planilhas", "Rotinas"],
    includes: [
      "Lê e organiza arquivos e mensagens que chegam por e-mail ou WhatsApp.",
      "Confere os dados e avisa só quando algo parece errado.",
      "Acaba com o vai e vem entre planilhas e sistemas.",
    ],
    example:
      "Os documentos chegam por e-mail e já aparecem organizados. Sua equipe só olha o que precisa de atenção.",
  },
  {
    icon: Cable,
    number: "03",
    title: "Seus sistemas trabalhando juntos",
    description:
      "Conectamos o que você já usa, como CRM, ERP e planilhas, para a informação certa chegar sem ninguém digitar de novo.",
    tags: ["CRM", "ERP", "Menos digitação"],
    includes: [
      "Você continua com as ferramentas que já conhece.",
      "Encontrar uma informação passa a levar segundos, não horas.",
      "Se algo falhar, a equipe é avisada e nada se perde.",
    ],
    example:
      "Um cliente novo entra no CRM e o resumo dele já chega para o vendedor, com o próximo passo sugerido.",
  },
  {
    icon: Blocks,
    number: "04",
    title: "Um sistema feito para o seu jeito de trabalhar",
    description:
      "Quando nenhuma ferramenta pronta resolve, criamos a solução sob medida para a sua operação.",
    tags: ["Feito para você", "Acompanhamento", "Evolui com a empresa"],
    includes: [
      "Desenhado a partir do que a sua empresa faz de verdade.",
      "Telas simples para a equipe usar sem treinamento longo.",
      "Entregamos funcionando e ficamos ao seu lado nos primeiros passos.",
    ],
    example:
      "Todos os pedidos num só lugar, com a IA ajudando e a equipe vendo cada etapa andar.",
  },
];
export const steps = [
  {
    icon: ScanSearch,
    title: "Conversa e diagnóstico",
    text: "Entendemos como sua empresa trabalha e descobrimos onde o tempo e o dinheiro estão escapando.",
    delivery: "Um mapa claro do que vale resolver primeiro",
    details: [
      "Onde sua equipe gasta mais tempo",
      "O que se repete e o que dá retrabalho",
      "Por onde começar para sentir resultado rápido",
    ],
  },
  {
    icon: Network,
    title: "Proposta clara",
    text: "Você recebe o plano, o prazo e o investimento antes de começar. Sem surpresa.",
    delivery: "Plano, prazo e valor combinados",
    details: [
      "O que será feito e como vai funcionar",
      "Quanto custa e em quanto tempo fica pronto",
      "Como vamos saber que deu certo",
    ],
  },
  {
    icon: Rocket,
    title: "Construção e testes",
    text: "Criamos, testamos com situações reais da sua empresa e colocamos para funcionar junto com a sua equipe.",
    delivery: "Solução funcionando no dia a dia",
    details: [
      "Testes com casos reais antes de entregar",
      "Conexão com as ferramentas que você usa",
      "Sua equipe aprende a usar na prática",
    ],
  },
  {
    icon: Activity,
    title: "Acompanhamento",
    text: "Depois de entregue, seguimos de olho, corrigimos o que for preciso e melhoramos com o uso.",
    delivery: "Melhoria contínua, se você quiser",
    details: [
      "Acompanhamos o funcionamento",
      "Ajustamos quando algo muda na sua rotina",
      "Novas ideias entram quando fizerem sentido",
    ],
  },
];
export const faqs = [
  {
    question: "Como isso ajuda minha empresa a fazer mais?",
    answer:
      "Encontramos o que atrasa o seu dia a dia e passamos essas tarefas para a tecnologia. Sua equipe ganha tempo para atender mais clientes e fechar mais trabalho, sem precisar contratar na mesma proporção.",
  },
  {
    question: "Por onde começar?",
    answer:
      "Por uma tarefa que se repete todo dia e incomoda. Na primeira conversa escolhemos juntos um ponto pequeno, para você ver resultado antes de investir em algo maior.",
  },
  {
    question: "Como vou saber se valeu a pena?",
    answer:
      "Combinamos antes o que vamos medir: horas economizadas, erros evitados, pedidos atendidos. Depois comparamos com o que era antes. Sem promessa que ninguém consegue cumprir.",
  },
  {
    question: "Meus dados ficam seguros?",
    answer:
      "Antes de começar, combinamos quais informações serão usadas, quem pode ver e onde ficam guardadas. Você sabe tudo o que acontece com os seus dados.",
  },
  {
    question: "Preciso entender de inteligência artificial?",
    answer:
      "Não. Você conta o problema do jeito que ele aparece no seu dia a dia e a gente cuida do resto: escolhe a melhor forma de resolver e explica em português simples.",
  },
  {
    question: "Funciona com os sistemas que eu já uso?",
    answer:
      "Na maioria dos casos, sim. Olhamos o que você usa hoje e dizemos com sinceridade o que dá para conectar e o que não dá.",
  },
  {
    question: "Quanto custa?",
    answer:
      "Cada projeto tem um valor, de acordo com o tamanho do problema. Você recebe o orçamento por escrito antes de começar, incluindo os custos que se repetem todo mês, se houver.",
  },
  {
    question: "E depois que fica pronto?",
    answer:
      "Você pode contratar o acompanhamento para a gente corrigir, ajustar e melhorar. Se quiser algo novo no futuro, fazemos uma nova proposta.",
  },
  {
    question: "A tecnologia decide tudo sozinha?",
    answer:
      "Só o que você permitir. Nas decisões importantes, uma pessoa da sua equipe confirma antes. Você mantém o controle.",
  },
];
