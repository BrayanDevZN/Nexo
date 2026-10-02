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
sem Redis/Gmail, preserva dados e não executa migrações nem cria administrador.
A inicialização normal cria as tabelas e o administrador de ADMIN_EMAIL/ADMIN_PASSWORD.
Reiniciar preserva a senha e o nome já salvos; não promove um membro com o mesmo e-mail.
Em desenvolvimento, esse par pode ficar vazio. Produção exige ambos.
A senha do painel é independente da senha de aplicativo Gmail.

## Arquitetura

| Camada | Responsabilidade |
| --- | --- |
| infra | Settings/env, conexões SQL/Redis/Google/yagmail e armazenamento das fotos |
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

| Método / rota | Uso |
| --- | --- |
| GET /health | liveness, sem dependências externas |
| GET /health/ready | verifica SQLite e Redis |
| POST /auth/register | name, phone, email, password; conta pending/member |
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
| GET /admin/users | somente admin; filtro status, limit/offset |
| GET /admin/notifications | somente admin; filtro unresolved_only, limit/offset |
| PATCH /admin/notifications/{id}/read | somente admin destinatário |
| POST /admin/notifications/{id}/decision | somente admin; decision approved/rejected |
| GET /clients | aprovado; filtros niche, contract_closed, limit/offset |
| POST /clients | aprovado; name, niche, phone/email/notes opcionais, contract_closed |
| GET/PATCH/DELETE /clients/{id} | aprovado; consulta, alteração ou remoção |
| PUT /auth/profile | próprio name e phone, inclusive pendente |
| PUT/GET/DELETE /auth/profile/photo | própria foto; upload multipart no campo file |

Pendentes acessam o próprio perfil, sem clientes ou rotas de admin. Cadastro cria uma
notificação para o administrador na mesma transação. Aprovação libera a sessão existente;
rejeição revoga sessões e impede login. Decisão repetida retorna 409. Não existe promoção
a administrador por essas rotas. Inicialização sincroniza pedidos pendentes faltantes.
Listagens têm máximo de 100 por página. Membros aprovados gerenciam todos os clientes;
created_by_id vem do servidor. PATCH limpa notes/email/phone com null.

## Browser e autenticação

JWT HS256 exige issuer, audience, validade, sub, ver e jti; não contém senha.
É aceito somente no cookie HttpOnly, sem token no JSON ou Authorization.
O navegador envia cookies com `credentials: "include"`; TypeScript não lê o JWT.
Mutações exigem Origin presente em CORS_ORIGINS. Mutações autenticadas também exigem
X-CSRF-Token obtido em /auth/csrf. Cadastro/login e recuperação pública exigem Origin;
conclusão Google usa o CSRF de /auth/google/profile. Respostas privadas usam no-store.

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
Identidade existente usa Google sub; e-mail coincidente com cadastro local não vincula contas.
Nova identidade recebe cookie temporário de 600 segundos e só vira conta ao informar
nome/celular. Redirecionamentos: FRONTEND_URL/admin e /admin/complete-profile.
Cookies OAuth usam Lax. As telas administrativas ainda precisam ser implementadas.

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
EMAIL/PASSWORD são o remetente Gmail e a senha de aplicativo; ADMIN_EMAIL/PASSWORD
são as credenciais iniciais do painel. Redis sem senha usa redis://host:porta/0.
GOOGLE_CLIENT_SECRET, PASSWORD, ADMIN_PASSWORD e JWT_SECRET_KEY ficam somente no backend.

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
Redis é local real; Gmail e endpoints Google são simulados. Não valida entrega Gmail
nem login Google real. GitHub Actions executa as três suítes e a suíte completa em
Python 3.12/3.13, com relatórios JUnit anexados.
