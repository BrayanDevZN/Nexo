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

Backend Python/FastAPI com autenticação por senha e Google, aprovação de contas,
clientes, perfil/foto, recuperação de senha, SQLite e Redis. Testes na raiz e CI
automático. Painel administrativo em /admin, mantendo a identidade visual do site.
Configure VITE_API_URL no frontend para a URL pública do backend; publique o backend
com FRONTEND_URL/CORS_ORIGINS correspondentes ao site. Consulte
[instruções do painel](src/frontend/admin/README.md).
Consulte [instruções do backend](src/backend/README.md).

### Documentos e identificação de criadores

Membros aprovados podem enviar e baixar documentos em `/documents`. A API grava os arquivos em `UPLOAD_DIR/documents` com nomes internos aleatórios; o SQLite guarda os metadados. Configure `DOCUMENT_MAX_BYTES` (padrão: 10485760, 10 MiB). São aceitos PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, TXT, CSV, ODT/ODS e RTF. Downloads exigem autenticação e são enviados como anexos. Exclusão exige ser o criador ou administrador. O volume `/data` no Railway deve preservar tanto o banco quanto uploads. A tabela é criada pelo comando de criação de tabelas já usado na inicialização.

Clientes mostram `created_by_name`; a listagem aceita filtros combinados `name` (trecho sem distinguir maiúsculas/minúsculas), `niche` (exato) e `created_by_id`, além de contrato e paginação. O diretório `/members` inclui apenas ID, nome, cargo e `has_photo`; imagens são obtidas autenticadas em `/members/{id}/photo`. Contas pendentes não acessam o diretório, clientes ou documentos. Administradores podem consultar fotos de contas pendentes ao gerenciá-las. Ao excluir uma conta, seus clientes e documentos são transferidos ao administrador principal.
