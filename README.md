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
- Marca com símbolo próprio gerado em `public/images/nexo-symbol-purple.png`, paleta branca/lavanda/violeta e sombras roxas.
- Entradas de conteúdo por IntersectionObserver, com reaparição ao sair e retornar à tela em ambas as direções, respeito à preferência por movimento reduzido.
- Fundo animado contínuo com manchas de luz roxa mais intensas e chuva diagonal de partículas em CSS, pausado com a aba oculta ou movimento reduzido.
- Contraste reforçado, contornos semânticos e sombras violetas para separar os elementos brancos.
- Tema, cores semânticas e responsividade em `src/styles/globals.css`.
- Conteúdo, exemplos de aplicação e link de contato em `src/lib/content.ts`.
- Carrossel do processo com Embla, arraste por mouse/toque e navegação por botões e teclado.
- Serviços em carrossel no celular e grade de duas colunas no desktop.
- Navegação interna por rolagem, mantendo a URL sem fragmentos `#`, inclusive no menu mobile.
- Menu mobile com foco controlado, perguntas frequentes e exemplos em abas.
- Fontes Geist servidas localmente e respeito a `prefers-reduced-motion`.
- Núcleo 3D em CSS com seis faces, órbitas em planos distintos e profundidade por perspectiva, sem WebGL ou novas dependências.
- Demonstrações ampliadas em streaming de contabilidade, marketing e atendimento, navegáveis por setas, teclado e arraste, identificadas como simulações com dados fictícios.
- Sem controles visíveis de pausa ou reinício; temporizadores pausam fora da tela ou quando a aba está oculta. Movimento reduzido mostra o conteúdo completo sem animação.
- Serviços com entregas e exemplos, processo com atividades de cada etapa, aplicações com gargalo, controle e indicadores de resultado.

As ilustrações e fluxos de aplicação são exemplos; não representam métricas ou resultados de clientes. Os links de contato abrem o WhatsApp existente da Nexo.

## Componentes

```sh
npx shadcn@latest info
npx shadcn@latest docs button
npx shadcn@latest add <componente>
```

O desenho anterior permanece preservado na branch `nexo-ai-v1`.
