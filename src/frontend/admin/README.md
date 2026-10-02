# Painel administrativo

Acesse /admin. O site institucional continua em /.
A rota /admin/complete-profile recebe cadastros Google novos.

## Configurar

Desenvolvimento na raiz:

```sh
nexo
npm --prefix src/frontend ci
npm --prefix src/frontend run dev
```

Frontend usa /api quando VITE_API_URL está vazio. O proxy Vite encaminha
para http://127.0.0.1:8000, preservando Origin.
Backend: FRONTEND_URL=http://localhost:5173 e
CORS_ORIGINS=["http://localhost:5173"], COOKIE_SECURE=false, COOKIE_SAMESITE=lax.
Ajuste ambos se usar outro host ou porta. Google callback local usa a porta do backend.

Na Vercel, Root Directory=src/frontend, build=npm run build, output=dist.
Configure VITE_API_URL com a URL HTTPS pública do backend e faça um novo build.
No backend, FRONTEND_URL e CORS_ORIGINS devem usar a origem exata do frontend,
COOKIE_SECURE=true, ENVIRONMENT=production e ADMIN_EMAIL/PASSWORD próprios.
Se frontend/API forem sites diferentes, COOKIE_SAMESITE=none. Prefira domínios
do mesmo site para evitar bloqueios de cookies de terceiros pelo navegador.
Cadastre no Google o callback HTTPS exato GOOGLE_REDIRECT_URI.

Somente a URL pública entra em VITE_API_URL. Secrets, senhas e JWT_SECRET_KEY
ficam no backend. O frontend não lê JWT e não guarda credenciais no storage.
Fetch envia credentials=include; mutações autenticadas buscam CSRF da sessão.
Fotos privadas são exibidas pela rota autenticada do backend.

## Fluxos

- Cadastro local pede nome, celular, e-mail e senha; após cadastro, faça login.
- Cadastro Google conclui nome/celular e recebe sessão pendente.
- Pendentes acessam o próprio perfil e foto. A aprovação é consultada a cada
  15 segundos enquanto a aba está visível, ou manualmente.
- Administrador recebe aviso de novos pedidos, consultados a cada 30 segundos;
  autorizar/recusar pede confirmação e usa decisão do backend.
- Membros aprovados consultam e gerenciam todos os clientes.
- Clientes têm filtros por nicho exato/contrato, páginas de 20 e confirmação para excluir.
- Perfil permite atualizar nome/celular e foto; senha atual ou código de e-mail
  permite alteração. Sessões são revogadas pelo backend, exigindo novo login.
- Erros de rede, sessão expirada e rate limit têm mensagens em português.

## Verificar

```sh
npm --prefix src/frontend run build
cd src/frontend
npx playwright install chromium
npm test
# Com Python/backend instalado e Redis local:
REDIS_TEST_URL=redis://127.0.0.1:6379/15 npm run test:full
```

Testes ficam na raiz: tests/unit/frontend, integration/frontend e functional/frontend.
Unit testa transporte e CSRF. Integration usa navegador com API simulada.
Functional usa FastAPI, SQLite temporário e Redis local real para cadastro,
aprovação, cookies HttpOnly, clientes, perfil/foto, senha e logout. Não faz login Google nem envio Gmail real.
CI executa todas as categorias e anexa relatórios/traces com dados sintéticos.

Os componentes novos seguem a base Radix do shadcn. O acesso ao registry via CLI
estava indisponível neste ambiente; os arquivos novos vieram da base oficial,
com imports, ícones Lucide e estilos semânticos adaptados ao projeto.
