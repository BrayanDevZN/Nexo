import { solutions, steps } from "@/lib/content";

const principles = [
  "Começamos pelo seu problema e só depois escolhemos a tecnologia.",
  "Nos adaptamos ao que você já usa, sem trocar tudo do zero.",
  "Você acompanha tudo e decide o que é feito sozinho e o que precisa de aprovação.",
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
  scene: "rings" | "agent" | "flow" | "systems" | "software" | "stages" | "stages3" | "orb" | "docs" | "ledger" | "archive" | "balance";
};

export const stations: Station[] = [
  {
    id: "inicio",
    kicker: "Nexo | Inteligência artificial para empresas",
    title: "Mais capacidade. Esse é o nexo.",
    text: "Sua equipe gasta tempo demais em tarefas repetitivas. Nós usamos IA para resolver isso, para você atender mais clientes e entregar mais sem sobrecarregar ninguém.",
    tags: "Atendimento | Rotinas automáticas | Sistemas conectados",
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
    text: "Um caminho simples, em quatro passos, do primeiro papo até a solução funcionando na sua empresa.",
    points: steps.map((step, index) => `${String(index + 1).padStart(2, "0")} ${step.title}: ${step.text}`),
    note: "No fim de cada passo você recebe algo concreto: " + steps.map((step) => step.delivery.toLowerCase()).join(", ") + ".",
    side: "left",
    scene: "stages",
  },
  {
    id: "sobre-estacao",
    anchor: "sobre",
    kicker: "A Nexo",
    title: "A conexão com o próximo passo.",
    text: "Somos a Nexo. Primeiro entendemos como a sua empresa funciona, depois resolvemos o que está travando o seu crescimento.",
    points: principles,
    note: "Você vê o resultado em números simples: quanto foi feito, quanto tempo levou e o que ficou pendente.",
    side: "right",
    scene: "orb",
  },
];
