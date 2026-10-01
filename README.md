# Nexo

Site institucional da Nexo, agência de inteligência artificial aplicada a processos de negócio.

## Desenvolvimento

Requer Node.js 22.12+ ou 24 e npm.

```sh
npm ci
npm run dev
```

```sh
npm run build
npm run preview
```

O build verifica TypeScript e gera os arquivos estáticos em `dist/`. A hospedagem existente no Railway continua utilizando `npm run start` com a variável `PORT` fornecida pela plataforma.

## Interface

- React, TypeScript e Vite.
- Tailwind CSS v4 e shadcn/ui (Radix, estilo Nova).
- Componentes locais em `src/components/ui`, configurados em `components.json`.
- Tema, cores semânticas e responsividade em `src/styles/globals.css`.
- Conteúdo, exemplos de aplicação e link de contato em `src/lib/content.ts`.
- Carrossel do processo com Embla, arraste por mouse/toque e navegação por botões e teclado.
- Menu mobile com foco controlado, perguntas frequentes e exemplos em abas.
- Fontes Geist servidas localmente e respeito a `prefers-reduced-motion`.

As ilustrações e fluxos de aplicação são exemplos; não representam métricas ou resultados de clientes. Os links de contato abrem o WhatsApp existente da Nexo.

## Componentes

```sh
npx shadcn@latest info
npx shadcn@latest docs button
npx shadcn@latest add <componente>
```

O desenho anterior permanece preservado na branch `nexo-ai-v1`.
