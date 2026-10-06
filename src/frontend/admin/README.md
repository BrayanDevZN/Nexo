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
Em produção, o admin usa /api no próprio domínio do frontend. O vercel.json
encaminha esse caminho para a API Railway e desativa cache das respostas.
VITE_API_URL só é usado em desenvolvimento; não configure acesso direto ao
Railway no navegador, pois isso depende de cookies de terceiros.
No backend, FRONTEND_URL e CORS_ORIGINS devem usar a origem exata do frontend,
COOKIE_SECURE=true, ENVIRONMENT=production e EMAIL/PASSWORD para o administrador.
Se frontend/API forem sites diferentes, COOKIE_SAMESITE=none. Prefira domínios
do mesmo site para evitar bloqueios de cookies de terceiros pelo navegador.
Na produção atual, configure no Railway e cadastre no Google:
GOOGLE_REDIRECT_URI=https://www.nexoaicompany.com/api/auth/google/callback
FRONTEND_URL=https://www.nexoaicompany.com
CORS_ORIGINS=["https://www.nexoaicompany.com"]
O cookie temporário Google usa o caminho público do callback (/api/auth/google)
para que a navegação e a conclusão do cadastro passem pelo mesmo domínio.
Variáveis cadastradas no Railway prevalecem sobre os padrões do Dockerfile.

Somente a URL pública entra em VITE_API_URL. Secrets, senhas e JWT_SECRET_KEY
ficam no backend. O frontend não lê JWT e não guarda credenciais no storage.
Fetch envia credentials=include; mutações autenticadas buscam CSRF da sessão.
Fotos privadas são exibidas pela rota autenticada do backend.

## Fluxos

- Cadastro local pede nome, celular, e-mail, senha e confirmação da senha.
  Senhas diferentes bloqueiam o envio. Confirmar o código de cadastro gera a
  sessão HttpOnly automaticamente; após salvar ou pular a foto, entra no painel
  sem novo login, aguardando aprovação.
- Cadastro Google conclui nome/celular e recebe sessão pendente.
- Quem criou conta com email/senha também pode usar Continuar com Google com o
  mesmo email verificado. O primeiro acesso vincula o Google à mesma conta sem
  novo cadastro. Quem criou pelo Google continua acessando somente pelo Google.
- Pendentes acessam o próprio perfil e foto. A aprovação é consultada a cada
  15 segundos enquanto a aba está visível, ou manualmente.
- Administrador recebe aviso de novos pedidos, consultados a cada 30 segundos;
  autorizar/recusar pede confirmação e usa decisão do backend.
- Membros aprovados consultam e gerenciam todos os clientes.
- A aba Membros é compartilhada pelos usuários aprovados e mostra apenas nome
  e cargo da equipe, sem contatos ou dados de autenticação. Usa GET /members.
- No mobile, o botão de menu abre um Sheet shadcn pela esquerda; selecionar uma
  página fecha a barra lateral. O menu respeita as permissões da conta.
- O lápis sobre a foto abre o seletor de arquivos, tanto no cadastro quanto no
  perfil. No perfil, a seleção válida salva automaticamente. O cadastro mantém
  a opção de salvar e continuar ou pular a foto.
- A aba Gerenciar membros é exclusiva de administradores: lista/filtro/paginação, edição
  de nome/email/celular e cargos Membro/Administrador para usuários aprovados.
  Excluir exige confirmação e preserva clientes. A conta principal é protegida.
  Alterar email/cargo encerra as sessões da conta alterada, exigindo novo login.
- Clientes têm filtros por nicho exato/contrato, páginas de 20 e confirmação para excluir.
- Perfil permite atualizar nome/celular e foto; senha atual ou código de e-mail
  permite alteração. Sessões são revogadas pelo backend, exigindo novo login.
- Perfil tem Apagar minha conta: primeiro envia código ao email da sessão;
  só a confirmação válida exclui a conta. Falha de envio mantém a conta.
  A exclusão encerra a sessão, preserva clientes e protege o admin principal.
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
CI executa todas as categorias com o Chrome da imagem Ubuntu 24.04 e anexa
relatórios/traces com dados sintéticos. Localmente, o padrão é o Chromium do Playwright.

Os componentes novos seguem a base Radix do shadcn. O acesso ao registry via CLI
estava indisponível neste ambiente; os arquivos novos vieram da base oficial,
com imports, ícones Lucide e estilos semânticos adaptados ao projeto.

### Chat

Nova aba Chat: seleção de membro aprovado, mensagens ao vivo, histórico paginado, foto, envio de áudio e gravação pelo microfone. O indicador mostra conexão/reconexão e avisos no painel permitem abrir a conversa de novas mensagens. Solicitações e aprovação de acesso usam eventos WebSocket, sem intervalos de polling. `VITE_WS_URL` é opcional e, em produção, usa o endereço Railway já configurado. A rolagem utiliza o componente oficial `@shadcn/react/message-scroller`; os elementos visuais de mensagem, bubble e attachment são composições locais com cores semânticas, pois o registry CLI estava inacessível.
