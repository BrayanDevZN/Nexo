# Backend administrativo Nexo

Python 3.12+, FastAPI, SQLAlchemy/SQLite e Redis standalone 6.2+. Execute os comandos na raiz.

## Iniciar

```sh
python -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
# Copiar somente se o arquivo ainda não existir:
cp -n .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(64))"
# Preencher JWT_SECRET_KEY com o resultado e configurar as demais variáveis.
nexo --check-config
nexo create-tables
nexo
```

Também aceita `python -m backend.main`. O comando `create-tables` cria tabelas ausentes
sem Redis/Resend, preserva dados e migra o formato dos cargos sem criar uma nova conta.
A inicialização normal cria as tabelas e o administrador de EMAIL/PASSWORD.
Reiniciar preserva a senha e o nome já salvos; não promove um membro com o mesmo e-mail.
Em desenvolvimento, esse par pode ficar vazio. Produção exige ambos.
Na criação inicial, a senha do painel vem de `PASSWORD`. O envio usa a chave
`RESEND_KEY` e, opcionalmente, `RESEND_FROM` como remetente verificado no Resend.
Opcionalmente, `URL_EMAIL_N8N` e `SECRET_EMAIL_N8N` configuram o webhook de e-mail
do n8n, com o token enviado como `Authorization: Bearer ...`. A aplicação conta
no Redis as tentativas mensais do Resend (mês UTC): as primeiras 70 usam Resend e
as seguintes usam o webhook n8n. O webhook recebe `to`, `type` (`html` ou `text`),
`subject` e `content`. Configure as duas variáveis do n8n juntas; elas não devem
ser commitadas.
Se `RESEND_FROM` ficar vazio, `EMAIL` será usado como remetente.

## Arquitetura

| Camada | Responsabilidade |
| --- | --- |
| infra | Settings/env, conexões SQL/Redis/Google/Resend e armazenamento das fotos |
| domain | bcrypt, JWT, CSRF, identidade Google, códigos de e-mail e normalização de fotos |
| repository | models, tabelas, transações, consultas SQL, Redis e cache-aside |
| service | cadastro, sessões, aprovações, clientes, perfil, senha e rate limit |
| controller | APIRouter por módulo, handles, schemas, dependências e middleware |
| main.py | configuração, comando de tabelas e servidor |

RepositoryManager compartilha uma transação SQL entre repositórios. Cache-aside guarda
snapshots seguros, incluindo consultas vazias, por CACHE_TTL_SECONDS e invalida gerações
por tabela depois do commit. Lua impede preencher uma geração já invalidada; rollback
não publica dados. Hash, Google sub e versão da sessão não entram nos snapshots.
Autorização sempre lê SQL. Falha do cache usa SQL; falha de Redis para rate limit,
OAuth ou códigos de senha responde 503. Cache pode ficar desatualizado até o TTL se
a invalidação falhar, houver crash ou escritas SQL externas ao manager.

## Rotas e permissões

| Cargo | Acesso |
| --- | --- |
| comercial | Clientes, funil, dashboard e documentos; biblioteca para consultar/baixar |
| dev | Chaves de API, automações e acesso ao n8n; biblioteca para consultar/baixar |

### Público dos avisos

Todo aviso tem um público: `all` (todos), `commercial` ou `dev`. Notificação, push e e-mail vão só para quem tem o cargo do
público, e administradores e owners recebem sempre todos. Os avisos automáticos seguem a mesma regra: eventos de clientes e
de documentos vão ao comercial (mais admin e owner); eventos da biblioteca de automações vão ao dev (mais admin e owner).
`POST /admin/announcements` aceita `audience` (padrão `all`).

### Chaves de API por cargo

Todo membro aprovado gera e revoga as próprias chaves (`/auth/api-keys`, sessão do painel). O alcance da chave depende
do cargo do dono, lido a cada requisição:

| Cargo do dono | O que a chave acessa |
| --- | --- |
| dev, admin, owner | Toda a API, conforme as regras de cada rota |
| comercial | Apenas `/clients` e `/auth/api-keys/validate` (a checagem que o servidor do Maps usa); qualquer outra rota responde 403 |

A chave que o painel usa no Maps é pessoal (cada membro salva a sua em `/maps/key`). Ela é guardada criptografada; a chave
compartilhada antiga e `MAPS_API_KEY` continuam como reserva para quem ainda não salvou a sua.
| admin | Áreas comerciais e de desenvolvimento; avisos; sem convites, aprovações ou gestão da equipe |
| owner | Todas as áreas, inclusive convites, aprovações e gestão de membros |

Contas antigas `member` são migradas para `commercial`; a conta configurada por EMAIL vira `owner`. Alterar um cargo revoga as sessões existentes.

| Método / rota | Uso |
| --- | --- |
| GET /health | liveness, sem dependências externas |
| GET /health/ready | verifica SQLite e Redis |
| POST /auth/register | name, phone, email, password; conta pending/commercial |
| GET /auth/invitations/{token} | valida convite e informa o cargo concedido |
| POST /auth/invitations/{token}/register | cria conta aprovada a partir de convite e inicia sessão |
| POST /auth/login | email, password; cookie JWT HttpOnly |
| GET /auth/me | próprio perfil seguro |
| GET /auth/csrf | token CSRF da sessão |
| POST /auth/logout | revoga todas as sessões |
| GET /auth/google/login | navegação para Google |
| GET /auth/google/callback | callback OAuth |
| GET /auth/google/profile | identidade verificada e CSRF de cadastro |
| POST /auth/google/complete | name e phone; conclui cadastro Google pendente |
| POST /auth/password/change | current_password, new_password |
| POST /auth/password/recovery/request | email; resposta genérica 202 |
| POST /auth/password/recovery/confirm | email, code, new_password |
| POST /auth/account/deletion/request | sessão e CSRF; envia código para o email da própria conta |
| POST /auth/account/deletion/confirm | sessão e CSRF; código de uso único confirma exclusão e limpa cookie |
| GET /members | usuários aprovados; lista paginada com apenas id, nome e cargo de contas aprovadas |
| GET /admin/users | somente owner; filtro status, limit/offset e identificação da conta principal |
| POST /admin/invitations | owner cria convite de comercial/dev/admin; link de uso único expira em 7 dias |
| PATCH /admin/users/{id} | owner altera nome, email, celular e cargo; cargo exige usuário aprovado |
| DELETE /admin/users/{id} | owner exclui conta e preserva seus clientes |
| GET /admin/notifications | somente owner; filtro unresolved_only, limit/offset |
| PATCH /admin/notifications/{id}/read | somente owner destinatário |
| POST /admin/notifications/{id}/decision | somente owner; decision approved/rejected |
| GET /clients | comercial/admin/owner; filtros niche, pipeline_stage, sales_channel, contract_closed, limit/offset |
| GET /automations | membro aprovado ou API key; lista a biblioteca compartilhada |
| POST /automations | dev/admin/owner; multipart `name`, `description`, `file` e `image` opcional; avisa os membros aprovados |
| PATCH /automations/{id} | dev/admin/owner; multipart com qualquer combinação de `name`, `description`, `file` e `image`; campos omitidos são preservados; gera aviso com a imagem atual |
| DELETE /automations/{id} | dev/admin/owner; exclui e gera aviso preservando a imagem |
| GET /automations/{id}/download | membro aprovado ou API key; baixa o arquivo privado |
| GET /automations/{id}/image | membro aprovado ou API key; foto opcional da automação |
| POST /clients | comercial/admin/owner; name, niche, phone/email/notes opcionais, sales_channel opcional (email, whatsapp, instagram, phone, in_person, other; vazio = sem canal), contract_closed |
| GET/PATCH/DELETE /clients/{id} | comercial/admin/owner; consulta, alteração ou remoção |
| PUT /auth/profile | próprio name e phone, inclusive pendente |
| PUT/GET/DELETE /auth/profile/photo | própria foto; upload multipart no campo file |


Os avisos de criação, atualização e exclusão de automações aparecem na área de Avisos para os membros aprovados. Quando houver capa, ela é copiada para o armazenamento dos avisos e continua acessível mesmo após a automação ser excluída. A lista inclui `can_manage`, calculado pelo servidor para o criador ou Owner.

Pendentes acessam o próprio perfil, sem clientes ou rotas exclusivas do Owner. Cadastro cria uma
notificação para o Owner na mesma transação. Aprovação libera a sessão existente;
rejeição revoga sessões e impede login. Decisão repetida retorna 409. Não existe promoção
a Owner por essas rotas. Inicialização sincroniza pedidos pendentes faltantes.
Listagens têm máximo de 100 por página. Membros aprovados gerenciam todos os clientes;
created_by_id vem do servidor. PATCH limpa notes/email/phone com null.

## Browser e autenticação

JWT HS256 exige issuer, audience, validade, sub, ver e jti; não contém senha.
É aceito somente no cookie HttpOnly, sem token no JSON ou Authorization.
O navegador envia cookies com `credentials: "include"`; TypeScript não lê o JWT.
Mutações exigem Origin presente em CORS_ORIGINS. Mutações autenticadas também exigem
X-CSRF-Token obtido em /auth/csrf. Cadastro/login e recuperação pública exigem Origin;
conclusão Google usa o CSRF de /auth/google/profile. Cadastro por convite exige Origin válido,
usa link de uso único com expiração de 7 dias e inicia sessão após confirmar a conta. Respostas privadas usam no-store.

```ts
const response = await fetch(API_URL + "/auth/csrf", { credentials: "include" });
const { csrf_token } = await response.json();
await fetch(API_URL + "/clients", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf_token },
  body: JSON.stringify({ name: "Loja", niche: "Varejo" }),
});
```

Google exige GOOGLE_CLIENT_ID/SECRET e callback exato GOOGLE_REDIRECT_URI no console.
State de 300 segundos é ligado ao browser e consumido uma vez no Redis; PKCE, nonce,
RS256/JWKS, issuer, audience, azp, validade e email_verified são verificados.
Identidade existente usa Google sub. Se ainda não houver vínculo Google e o email
verificado coincidir com uma conta local com senha, vincula o sub à mesma conta e
emite sessão. Não altera senha, nome, celular, cargo ou aprovação. Contas criadas
só pelo Google continuam sem senha local, inclusive na recuperação de senha.
Nova identidade recebe cookie temporário de 600 segundos e só vira conta ao informar
nome/celular. Redirecionamentos: FRONTEND_URL/admin e /admin/complete-profile.
Cookies OAuth usam Lax. As telas administrativas ficam em src/frontend/admin e são acessadas em /admin.

Senhas: bcrypt custo 12, mínimo 12 caracteres e máximo 72 bytes UTF-8.
Troca/redefinição revoga todas as sessões e exige novo login. Conta exclusivamente Google
não recebe senha local pelo fluxo. Códigos de 8 dígitos ficam apenas como HMAC no Redis,
com TTL, cooldown e tentativas limitadas via Lua. Consumo ocorre antes da escrita SQL;
falha SQL exige solicitar novo código após cooldown.

Yagmail usa ThreadPoolExecutor, conexão por tarefa, timeout e fila limitada.
Boas-vindas após commit são best effort. Pedidos de recuperação não revelam existência
da conta. Não há Celery/worker/fila durável; crash pode perder e-mails em memória.

Fotos JPEG/PNG/WebP estáticas são regravadas em JPEG de até 512x512, sem metadados.
Limites de bytes/pixels vêm do env; configure também limite de corpo no proxy.
Arquivos UUID privados ficam em UPLOAD_DIR, sem rota estática pública.
SQL e filesystem não têm transação conjunta; crash pode deixar arquivos órfãos.

## Ambiente e operação

.env.example lista todas as variáveis. Ambiente sobrescreve dotenv.
EMAIL/PASSWORD inicializam o Owner com senha bcrypt. `RESEND_KEY` autoriza o
envio de e-mails pela API HTTPS do Resend; `RESEND_FROM` deve ser um remetente
verificado no Resend (ou `EMAIL`, quando vazio). Redis sem senha usa redis://host:porta/0.
GOOGLE_CLIENT_SECRET, PASSWORD e JWT_SECRET_KEY ficam somente no backend.

Produção exige ENVIRONMENT=production, COOKIE_SECURE=true e URLs HTTPS.
Para frontend/API em sites diferentes, configure COOKIE_SAMESITE=none e a origem exata
em CORS_ORIGINS; a política de cookies do navegador ainda se aplica.
HOST=0.0.0.0 expõe o serviço no container. PORT vem do ambiente.
Use volumes persistentes para DATABASE_URL e UPLOAD_DIR. Não há migrações automáticas.

FORWARDED_ALLOW_IPS configura os IPs/redes dos proxies confiáveis do Uvicorn;
o padrão é 127.0.0.1, e vazio desativa confiança. Usar * requer acesso ao backend
restrito ao proxy que substitui os headers recebidos do cliente. O middleware usa
request.client, sem interpretar X-Forwarded-For por conta própria.

| Variáveis de limite | Padrão |
| --- | --- |
| GLOBAL_RATE_LIMIT / GLOBAL_RATE_LIMIT_WINDOW_SECONDS | 1000 / 60 |
| RATE_LIMIT / RATE_LIMIT_WINDOW_SECONDS | 60 / 60 |
| AUTH_RATE_LIMIT / AUTH_RATE_LIMIT_WINDOW_SECONDS | 10 / 60 |

Global abrange a aplicação; por rota usa IP+método+template; auth compartilha orçamento
por IP entre login, cadastro, logout, senhas e Google. Lua usa INCR/PEXPIRE atomicamente
em janelas iniciadas no primeiro pedido. Excesso: 429 e Retry-After; Redis fora: 503.
GET/HEAD health e OPTIONS são isentos. IPs compartilhados dividem orçamento.
Docs/OpenAPI ficam desativados em produção.

## Testes

```sh
docker run --rm -p 6379:6379 redis:7-alpine
REDIS_TEST_URL=redis://127.0.0.1:6379/15 python -m pytest tests
python -m ruff check src/backend tests
```

tests/unit, integration e functional seguem as camadas na raiz. O cenário
functional/system atravessa cadastro, aprovação, clientes, perfil/foto, troca de senha,
recuperação e logout com cookies Secure/HttpOnly. SQLite e arquivos são temporários.
Redis é local real; Resend e endpoints Google são simulados. Não valida entrega Resend
nem login Google real. GitHub Actions executa as três suítes e a suíte completa em
Python 3.12/3.13, com relatórios JUnit anexados.

O cadastro local inicia em `POST /auth/register` (202), envia um código de 8 dígitos pelo Resend e guarda apenas o hash bcrypt e os dados temporários no Redis. `POST /auth/register/confirm` recebe email e código e cria a conta pendente (201). A notificação para o Owner só é criada após a confirmação. Os códigos usam o TTL, limite de tentativas e intervalo de reenvio de `EMAIL_CODE_*` e são de uso único; cadastro e recuperação usam namespaces e assinaturas distintos. O Owner inicial continua sendo configurado automaticamente com `EMAIL`/`PASSWORD`, sem confirmação. O Google usa o email verificado pelo provedor.

Convites são criados por administradores com cargo definido, guardados no Redis com token aleatório e uso único, e expiram em sete dias. O cadastro pelo link (senha ou Google) cria a conta aprovada imediatamente e inicia a sessão.

No painel, `POST /auth/password/change` exige senha atual e nova senha. A opção “Esqueci minha senha” continua usando os endpoints `/auth/password/recovery/request` e `/auth/password/recovery/confirm`, com código por email. Após o cadastro local ou o preenchimento do perfil Google, o frontend oferece foto opcional ou pular; o upload usa `/auth/profile/photo`, protegido por sessão e CSRF, inclusive para contas pendentes.

O cadastro só responde 202 depois que a API do Resend aceita a mensagem. Falha ou timeout retorna 503, invalida o código e libera nova tentativa; o intervalo normal de reenvio retorna 429. Os logs classificam falhas de rede, autenticação e rejeição do provedor sem expor credenciais ou conteúdo.

O retorno OAuth legado no domínio Railway é redirecionado uma única vez para o `/api/auth/google/callback` do frontend antes de consumir o state. O cookie fica no domínio do frontend com Path=/ e HttpOnly/Secure; a identidade continua exigindo state ligado ao navegador, PKCE e nonce. Isso permite a configuração atual cujo redirect URI aponta para Railway. A configuração preferida continua sendo o callback no domínio www, cadastrado também no Google Console. A foto é carregada por fetch autenticado e apresentada com um blob temporário, que é revogado ao sair do perfil.


## Gestão de membros

Os cargos são `member` (clientes), `admin` (clientes e funções operacionais) e `owner` (todas as funcionalidades e gestão administrativa).
A conta principal é identificada pelo `EMAIL` do ambiente, mesmo após promover
outros usuários. O e-mail/cargo da conta principal e sua exclusão são protegidos. Administradores
não podem aprovar contas, gerenciar membros, publicar avisos ou administrar pedidos de automação.

Alterar email ou cargo incrementa `session_version`, revogando sessões antigas.
Nome e celular podem ser corrigidos sem alterar senha ou aprovação.
As mutações de gestão de membros exigem sessão de Owner aprovado e CSRF. Não há edição de
senhas, hashes, estado de aprovação ou identificadores Google por essas rotas.

A exclusão transfere clientes ao principal e remove notificações relacionadas
na mesma transação SQL. Após commit, invalida caches de usuários, clientes e
notificações e remove o arquivo de foto, se houver. Falha SQL reverte tudo.
Não são necessárias novas tabelas ou migração para esses cargos.


A lista compartilhada `/members` valida aprovação e sessão no SQL antes de ler
cache. O service aplica uma lista explícita de campos (`id`, `name`, `role`) e
`MemberDirectoryOutput` restringe novamente a resposta. Email, telefone, senha,
hash, identificador Google e versão de sessão não fazem parte desse retorno.
A gestão `/admin/users` é exclusiva de Owners e permite contatos para
edição, mas seus schemas e snapshots também excluem qualquer senha/hash.
Ambas as listas respondem com `Cache-Control: no-store`.


## Exclusão da própria conta

`AccountDeletionService` usa Resend no executor já existente, aguardando a API
aceitar o envio antes de responder 202. Redis guarda apenas HMAC do código
com propósito `account-deletion`, ID e versão da sessão, separado dos códigos de
cadastro e recuperação. Reutiliza TTL, tentativas máximas e cooldown configurados
em `EMAIL_CODE_*`; as duas rotas também têm limite de autenticação.

O código é de uso único e vinculado à identidade autenticada. Mudanças de email,
senha ou cargo invalidam a confirmação antiga. Solicitar código não exclui conta;
falha do Resend invalida o código e permite nova tentativa. Contas pendentes e
contas Google podem usar o fluxo, mas a conta Owner principal permanece protegida.

A exclusão usa a mesma transação de preservação de clientes e limpeza de
notificações/foto da gestão de membros. Remove o usuário, revoga todas as sessões
por ausência da conta no SQL e limpa o cookie HttpOnly após o commit.

## Chat e notificações em tempo real

`POST /realtime/ticket` exige o cookie JWT HttpOnly e CSRF. Retorna um ticket de uso único com TTL de 30 segundos no Redis, vinculado à origem e à sessão. O navegador abre `/realtime` com os subprotocolos `nexo.v1` e o ticket. O servidor seleciona somente `nexo.v1`, verifica a origem em `CORS_ORIGINS`, revalida o usuário no SQL a cada comando/evento e no heartbeat de 15 segundos. Expiração, rejeição, exclusão, logout ou alteração de senha/cargo encerram a conexão; o JWT nunca é enviado ao JavaScript.

Eventos `notifications.changed` atualizam as solicitações dos Owners; `account.changed` atualiza o acesso sem polling. Mensagens `chat.send` recebem `chat.ack` após persistência e `chat.message` nos sockets dos dois participantes. `client_id` UUID por remetente torna retries idempotentes. Pub/Sub Redis distribui eventos entre processos; consultas SQL com cache aside recuperam o histórico após reconexão. Pub/Sub não é histórico durável.

`GET /chat/{member_id}/messages?before=<sequence>&limit=50` fornece paginação do histórico privado. `POST /chat/{member_id}/media` recebe multipart com `file`, `kind` (`image`/`audio`) e `client_id` UUID; arquivos usam HTTP autenticado e os eventos de novas mídias são entregues por WebSocket. `GET /chat/media/{id}` exige ser participante aprovado, inclusive para Owners. Fotos são normalizadas para JPEG sem metadados; áudio aceita WebM, Ogg, WAV, MP3 e M4A com validação de assinatura. Mídias ficam em `UPLOAD_DIR/chat`, no mesmo volume `/data` do banco. Excluir a conta remove suas conversas e respectivos arquivos, preservando clientes/documentos como antes.

`CHAT_MEDIA_MAX_BYTES=10485760`, `WS_CONNECTIONS_PER_USER=3` e `WS_MESSAGE_LIMIT=60` são opcionais. O rate limit global também conta comandos WebSocket. Tickets usam SET/EX e GETDEL; conexões usam leases em ZSET com TTL e comandos usam contadores INCR/TTL; frames textuais são limitados a 16 KiB, filas são limitadas e consumidores lentos são desconectados. Uma indisponibilidade de Redis não desfaz uma mensagem já confirmada no SQLite.

No frontend publicado, a conexão vai diretamente para `wss://nexo-production-60a0.up.railway.app/realtime`. Opcionalmente configure `VITE_WS_URL` na Vercel com a URL pública completa e refaça o build. Requisições HTTP continuam em `/api`; não é necessário compartilhar o cookie JWT com o domínio Railway. Mantenha a origem exata do site em `CORS_ORIGINS`. A gravação usa MediaRecorder, exige permissão de microfone e contexto seguro, limita clipes a dois minutos e permite escolher um arquivo caso a gravação não seja suportada. Não há criptografia ponta a ponta: o servidor armazena mensagens e mídias.

