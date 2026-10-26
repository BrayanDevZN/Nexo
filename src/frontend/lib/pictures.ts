/** Real pictures of the world around the work Nexo does (connecting, automating, counting). They show history, never Nexo's own product or team. */
export type Picture = {
  src: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
  credit: { title: string; author: string; license: string; licenseUrl: string; page: string };
};

export const pictures = {
  exchange: {
    src: "/images/world/telephone-exchange-1945.webp",
    width: 1500,
    height: 941,
    alt: "Cartão-postal colorido de uma central telefônica com operadoras sentadas diante da mesa de ligações.",
    caption: "Central telefônica de Chinatown, São Francisco (cartão-postal, 1945)",
    credit: {
      title: "1945-09-10 Interior Chinese telephone exchange, San Francisco, Calif A",
      author: "autor desconhecido",
      license: "Domínio público",
      licenseUrl: "https://commons.wikimedia.org/wiki/File:1945-09-10_Interior_Chinese_telephone_exchange,_San_Francisco,_Calif_A.jpg",
      page: "https://commons.wikimedia.org/wiki/File:1945-09-10_Interior_Chinese_telephone_exchange,_San_Francisco,_Calif_A.jpg",
    },
  },
  patternCards: {
    src: "/images/world/pattern-cards.webp",
    width: 1500,
    height: 1125,
    alt: "Cartões metálicos perfurados ao lado de fios esticados em um tear: cada furo define quais fios sobem.",
    caption: "Cartões de padrão de um tear, Índia",
    credit: {
      title: "India - Sights & Culture - Hand-loom pattern cards for silk sari weaving (2507306023)",
      author: "McKay Savage",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0",
      page: "https://commons.wikimedia.org/wiki/File:India_-_Sights_%26_Culture_-_Hand-loom_pattern_cards_for_silk_sari_weaving_(2507306023).jpg",
    },
  },
  switchboard: {
    src: "/images/world/switchboard.webp",
    width: 1500,
    height: 1000,
    alt: "Mesa telefônica antiga com fileiras de pontos de conexão e painel de controle.",
    caption: "Mesa telefônica antiga",
    credit: {
      title: "Antique telephone switchboard (44696285741)",
      author: "Thomas Quine",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0",
      page: "https://commons.wikimedia.org/wiki/File:Antique_telephone_switchboard_(44696285741).jpg",
    },
  },
  addingMachine: {
    src: "/images/world/adding-machine.webp",
    width: 1500,
    height: 1125,
    alt: "Máquina de somar Remington cinza ao lado da caixa original vermelha.",
    caption: "Máquina de somar Remington, modelo 102",
    credit: {
      title: "Remington Adding Machine Model 102",
      author: "Issac I Navarro",
      license: "CC BY 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0",
      page: "https://commons.wikimedia.org/wiki/File:Remington_Adding_Machine_Model_102.jpg",
    },
  },
  abacus: {
    src: "/images/world/abacus.webp",
    width: 1500,
    height: 1125,
    alt: "Um ábaco de madeira e uma calculadora com ábaco embutido, lado a lado.",
    caption: "Ábaco em uso numa loja, Otaru, Japão",
    credit: {
      title: "Abacus actually in use at kimono shop in Otaru",
      author: "Syced",
      license: "CC0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      page: "https://commons.wikimedia.org/wiki/File:Abacus_actually_in_use_at_kimono_shop_in_Otaru.jpg",
    },
  },
} satisfies Record<string, Picture>;
