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
- Entradas de conteúdo por IntersectionObserver, com reaparição ao sair e retornar à tela em ambas as direções.
- Fundo animado contínuo com manchas de luz roxa mais intensas e chuva diagonal de partículas em CSS, pausado com a aba oculta ou quando o visitante escolhe reduzir as animações.
- Contraste reforçado, contornos semânticos e sombras violetas para separar os elementos brancos.
- Tema, cores semânticas e responsividade em `src/frontend/styles/globals.css`.
- Conteúdo, exemplos de aplicação e link de contato em `src/frontend/lib/content.ts`.
- Carrossel do processo com Embla, arraste por mouse/toque e navegação por botões e teclado.
- Serviços em carrossel no celular e grade de duas colunas no desktop.
- Cards compactos no mobile, textos resumidos nos serviços e no streaming e apresentação compacta dos benefícios.
- Navegação interna por rolagem, mantendo a URL sem fragmentos `#`, inclusive no menu mobile.
- Menu mobile com foco controlado, perguntas frequentes e benefícios com indicadores de validação.
- Fontes Geist servidas localmente.
- Núcleo 3D em CSS com seis faces, órbitas em planos distintos e profundidade por perspectiva, sem WebGL ou novas dependências.
- Demonstrações ampliadas em streaming de contabilidade, marketing e atendimento, navegáveis por setas, teclado e arraste, identificadas como simulações com dados fictícios.
- Sem controles visíveis de pausa ou reinício; temporizadores pausam fora da tela ou quando a aba está oculta. As animações tocam mesmo quando o sistema operacional pede movimento reduzido (muitos PCs fracos ativam isso pelo perfil de energia e o site ficava estático). Quem quiser menos movimento usa o botão "Reduzir animações" no rodapé; a escolha fica salva no navegador (`html[data-reduce-motion="true"]`) e mostra o conteúdo completo sem animação.
- Serviços com entregas e exemplos, processo com atividades de cada etapa, valor para o negócio com mecanismos, impactos potenciais e indicadores.

- Desempenho em computadores fracos: o símbolo da marca tem 256 px (cerca de 40 KB, em vez de 720 KB); a chuva do fundo usa três camadas animadas em vez de oitenta e quatro; a digitação das demonstrações atualiza só os textos que mudam, no mesmo ritmo, em vez de renderizar o card inteiro a cada passo. Um teste de fluidez roda depois do carregamento e, só em aparelho lento (ou com 2 núcleos/2 GB), liga `html[data-perf="lite"]`: nenhuma animação nem elemento sai, apenas o desfoque ao vivo do cabeçalho vira um fundo quase opaco.

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

Membros aprovados podem enviar e baixar documentos em `/documents`. A API grava os arquivos em `UPLOAD_DIR/documents` com nomes internos aleatórios; o SQLite guarda os metadados. Configure `DOCUMENT_MAX_BYTES` (padrão: 10485760, 10 MiB). São aceitos PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, TXT, CSV, ODT/ODS e RTF. Downloads exigem autenticação e são enviados como anexos. Exclusão de documentos de outras pessoas exige Owner; o criador pode excluir os próprios documentos. O volume `/data` no Railway deve preservar tanto o banco quanto uploads. A tabela é criada pelo comando de criação de tabelas já usado na inicialização.

Clientes mostram `created_by_name`; a listagem aceita filtros combinados `name` (trecho sem distinguir maiúsculas/minúsculas), `niche` (exato) e `created_by_id`, além de contrato e paginação. O diretório `/members` inclui apenas ID, nome, cargo e `has_photo`; imagens são obtidas autenticadas em `/members/{id}/photo`. Contas pendentes não acessam o diretório, clientes ou documentos. Owners podem consultar fotos de contas pendentes ao gerenciá-las. Ao excluir uma conta, seus clientes e documentos são transferidos ao Owner principal.

### Node Nexo para n8n

O node privado da Nexo para n8n permite consultar e administrar recursos da API usando uma chave de API por credencial. Ele inclui operações para clientes, automações, documentos, avisos, chat, dashboard e avisos administrativos.

Os arquivos do node e as instruções de instalação e implantação estão em [`n8n/`](n8n/README.md). Para criar a imagem personalizada baseada na imagem oficial `n8nio/n8n:latest`, use o [`Dockerfile.n8n`](Dockerfile.n8n) na raiz do repositório como Dockerfile do serviço n8n no Railway. Preserve o volume de dados existente do n8n (por exemplo, `/root/.n8n`), a chave de criptografia e faça backup antes de trocar a imagem.
