import { solutions, steps } from "@/lib/content";

const principles = [
  "Impacto antes da ferramenta: o projeto começa com um problema concreto e critérios claros para avaliar a solução.",
  "Integração com a realidade: dados, sistemas e pessoas fazem parte da arquitetura.",
  "Autonomia com controle: regras, rastreabilidade e revisão humana definidas para cada processo.",
];

/** Where the 3D journey is, shared between the scroll code (Journey.tsx) and the scene (world.ts). */
export const journey = {
  /** Station position as a float: 2.5 is halfway between station 2 and 3. */
  station: 0,
  /** 0 while the last station is pinned, rising to 1 as the corridor scrolls away: the last shape breaks into particles. */
  exit: 0,
  /** Wheel/scroll speed in stations per second, signed. */
  velocity: 0,
  /** Pointer position from -1 to 1. */
  pointer: { x: 0, y: 0 },
  /** False when the journey is off screen or the tab is hidden: the scene stops drawing. */
  active: true,
};

export type Station = {
  id: string;
  anchor?: string;
  kicker: string;
  title: string;
  text: string;
  tags?: string;
  points?: string[];
  note?: string;
  side: "left" | "right" | "center";
  scene: "rings" | "agent" | "flow" | "systems" | "software" | "stages" | "orb";
};

export const stations: Station[] = [
  {
    id: "inicio",
    kicker: "Nexo | IA aplicada",
    title: "Mais capacidade. Esse é o nexo.",
    text: "Menos gargalos: conectamos seus sistemas com IA e automação para a sua equipe atender mais clientes e fazer mais entregas.",
    tags: "Agentes de IA | Automação | Sistemas | Software",
    side: "center",
    scene: "rings",
  },
  ...solutions.map((solution, index): Station => ({
    id: `solucao-${index + 1}`,
    anchor: index === 0 ? "solucoes" : undefined,
    kicker: `${solution.number} | Solução`,
    title: solution.title,
    text: solution.description,
    tags: solution.tags.join(" | "),
    points: solution.includes,
    note: solution.example,
    side: index % 2 === 0 ? "left" : "right",
    scene: (["agent", "flow", "systems", "software"] as const)[index],
  })),
  {
    id: "processo-estacao",
    anchor: "processo",
    kicker: "Como funciona",
    title: "Primeiro o problema. Depois, a tecnologia.",
    text: "Do diagnóstico à solução em produção: um caminho claro entre entender a sua operação e colocar uma solução para trabalhar.",
    points: steps.map((step, index) => `${String(index + 1).padStart(2, "0")} ${step.title}: ${step.text}`),
    note: "Entregas: " + steps.map((step) => step.delivery).join("; ") + ".",
    side: "left",
    scene: "stages",
  },
  {
    id: "sobre-estacao",
    anchor: "sobre",
    kicker: "A Nexo",
    title: "A conexão com o próximo passo.",
    text: "Somos uma agência de inteligência artificial que começa pelo negócio: entendemos como sua empresa funciona, identificamos o que trava a operação e construímos soluções para ampliar sua capacidade.",
    points: principles,
    note: "Medimos o resultado pelo volume concluído, tempo de resposta e fila de pendências de cada processo.",
    side: "right",
    scene: "orb",
  },
];
