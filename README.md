# Nexo

Site institucional da Nexo, agência de inteligência artificial aplicada a processos de negócio.

## Desenvolvimento

Requer Node.js 22.12+ ou 24 e npm.

```sh
cd src/frontend
npm ci
npm run dev
```

```sh
npm run build
npm run preview
```

O build verifica TypeScript e gera os arquivos estáticos em `src/frontend/dist/`.

Na Vercel, configure **Root Directory** como `src/frontend`, build como `npm run build` e saída como `dist`. No Railway, configure a raiz do serviço como `/src/frontend` e utilize `npm run start` com a variável `PORT` fornecida pela plataforma.

## Interface

- React, TypeScript e Vite.
- Tailwind CSS v4 e shadcn/ui (Radix, estilo Nova).
- Componentes locais em `src/frontend/components/ui`, configurados em `src/frontend/components.json`.
- Marca com símbolo próprio gerado em `src/frontend/public/images/nexo-symbol-purple.png`, paleta branca/lavanda/violeta e sombras roxas.
- Entradas de conteúdo por IntersectionObserver, com reaparição ao sair e retornar à tela em ambas as direções, respeito à preferência por movimento reduzido.
- Fundo animado contínuo com manchas de luz roxa mais intensas e chuva diagonal de partículas em CSS, pausado com a aba oculta ou movimento reduzido.
- Contraste reforçado, contornos semânticos e sombras violetas para separar os elementos brancos.
- Tema, cores semânticas e responsividade em `src/frontend/styles/globals.css`.
- Conteúdo, exemplos de aplicação e link de contato em `src/frontend/lib/content.ts`.
- Carrossel do processo com Embla, arraste por mouse/toque e navegação por botões e teclado.
- Serviços em carrossel no celular e grade de duas colunas no desktop.
- Cards compactos no mobile, textos resumidos nos serviços e no streaming e apresentação compacta dos benefícios.
- Navegação interna por rolagem, mantendo a URL sem fragmentos `#`, inclusive no menu mobile.
- Menu mobile com foco controlado, perguntas frequentes e benefícios com indicadores de validação.
- Fontes Geist servidas localmente e respeito a `prefers-reduced-motion`.
- Núcleo 3D em CSS com seis faces, órbitas em planos distintos e profundidade por perspectiva, sem WebGL ou novas dependências.
- Demonstrações ampliadas em streaming de contabilidade, marketing e atendimento, navegáveis por setas, teclado e arraste, identificadas como simulações com dados fictícios.
- Sem controles visíveis de pausa ou reinício; temporizadores pausam fora da tela ou quando a aba está oculta. Movimento reduzido mostra o conteúdo completo sem animação.
- Serviços com entregas e exemplos, processo com atividades de cada etapa, valor para o negócio com mecanismos, impactos potenciais e indicadores.

As ilustrações e fluxos de aplicação são exemplos; não representam métricas ou resultados de clientes. Os links de contato abrem o WhatsApp existente da Nexo.

## Componentes

```sh
cd src/frontend
npx shadcn@latest info
npx shadcn@latest docs button
npx shadcn@latest add <componente>
```

O desenho anterior permanece preservado na branch `nexo-ai-v1`.

## Backend administrativo

Etapa 1: estrutura Python/FastAPI, configuração validada e testes na raiz.
Consulte [instruções do backend](src/backend/README.md).
