# Backend Nexo — etapas 1 a 9

Executar os comandos a partir da raiz do repositório. Requer Python 3.12+.

```sh
python -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
cp .env.example .env  # somente se ainda não existir; não sobrescreva credenciais
python -c "import secrets; print(secrets.token_urlsafe(64))"
# Preencher JWT_SECRET_KEY com o resultado.
nexo --check-config
nexo
```

Também é possível executar `python -m backend.main` ou
`uvicorn backend.controller.application:create_app --factory`.
`GET /health` verifica apenas se a API está viva; não verifica serviços externos.

## Camadas

- `infra/config`: leitura e validação do ambiente. `infra/connections`: futuras conexões.
- `domain`: futuro bcrypt/JWT; não depende do controller.
- `repository`: futuros models, tabelas, controles SQL/Redis e cache-aside.
- `service`: futuras regras de negócio e integração dos repositórios.
- `controller`: aplicação, handles/APIRouter, schemas e futuros middlewares.
- `main.py`: comando de validação e inicialização.

Autenticação HTTP está implementada; rate limiting será feito na etapa 11. A etapa 2 implementa
as conexões e o transporte de e-mail; a etapa 3 implementa tabelas e repositórios SQL.
Não há rotas públicas de CRUD ou envio de e-mail nesta versão.

## Ambiente

`.env` é lido da raiz por caminho absoluto, independentemente do diretório atual.
Variáveis do processo têm prioridade. `.env.example` documenta todas as opções sem secrets.
Os paths relativos de SQLite e uploads são relativos ao diretório de execução;
rode da raiz ou use paths absolutos em produção (volume persistente).

JWT_SECRET_KEY é obrigatório (mínimo 32 caracteres). Pares de credenciais são opcionais
no desenvolvimento, mas devem estar completos. Produção exige admin, cookies Secure e
URLs HTTPS. SameSite=None exige Secure. Senhas/URL Redis não aparecem no repr nem nos
erros do CLI. CORS aceita apenas origens explícitas. Ajuste SameSite e origens aos domínios
reais no deploy. Cookie JWT e proteção CSRF estão implementados.

E-mails: yagmail em ThreadPoolExecutor; nenhum Celery/worker separado.
Não reutilizar a senha de aplicativo do Gmail como senha do administrador.

## Testes e CI

```sh
python -m pytest tests/unit
python -m pytest tests/integration
python -m pytest tests/functional
ruff check src/backend tests
```

Há um workflow em `.github/workflows` por suíte, executado em push/PR da main,
sem credenciais reais e sem Environment de produção. Cada nova camada ampliará
as três suítes. Secrets do GitHub não configuram automaticamente o Railway.

## Etapa 2 — conexões

`DatabaseConnection` cria o diretório do SQLite e fornece sessões com commit/rollback,
foreign keys ativadas e encerramento do engine. Nenhuma tabela de negócio é criada ainda.
`RedisConnection` usa pool, resposta textual, timeout e encerramento explícitos.
As conexões são instanciadas no lifespan; probes reais ficam em `/health/ready`.
Gmail não é testado pelo probe e não há rota pública para enviar e-mail.

`GmailConnection.send` retorna um Future. Há limite de tarefas em voo (`EMAIL_QUEUE_LIMIT`),
threads (`EMAIL_MAX_WORKERS`) e timeout SMTP (`EMAIL_TIMEOUT_SECONDS`). Cada tarefa usa
seu próprio yagmail.SMTP e fecha a conexão. Falhas são observáveis pelo Future e por log
sem mensagem/código/senha. Conteúdo é texto explícito (raw), nunca anexo inferido.
O shutdown aguarda os envios aceitos; um crash ainda pode perder tarefas, sem fila durável.

Para executar integração/funcional com Redis local:

```sh
docker run --rm -p 6379:6379 redis:7-alpine
REDIS_TEST_URL=redis://127.0.0.1:6379/15 python -m pytest tests
```

CI provisiona Redis para as suítes integration/functional. SQLite é temporário nos testes.
Gmail usa transporte substituído por mock; nenhum e-mail real é enviado por testes.

## Etapa 3 — banco e repositórios

```sh
nexo create-tables
# equivalente: python -m backend.main create-tables
```

Cria users, clients e notifications; repetir preserva os dados. Não é uma ferramenta
para alterar schemas existentes. Mudanças futuras exigirão migrações explícitas.
O comando não acessa Redis/Gmail nem cria o administrador ainda (etapa 6).

Users: UUID, nome, e-mail normalizado único, celular, hash opcional para login Google,
Google sub único, foto, role (member/admin), status (pending/approved/rejected), versão de
sessão e timestamps UTC. Contas novas são pending/member por padrão.
Clients: UUID, nome, nicho, celular/e-mail opcionais, contrato fechado, observações e criador.
Notifications: destinatário, usuário solicitante, leitura, decisão e resolução.
O serviço de aprovação e as permissões serão implementados depois; os repositórios
não constituem autorização e não são expostos diretamente por HTTP.

RepositoryManager.transaction compartilha uma sessão entre os controles. Repositórios
fazem flush, sem commits próprios, permitindo aprovação/notificação atômicas. Listagens
são paginadas (máximo 100), chaves estrangeiras impedem apagar criadores referenciados.
Não armazenar senhas em texto nos campos password_hash. Nenhuma conta real é criada
por esta etapa. Os testes usam SQLite temporário e verificam persistência, unicidade,
rollback, filtros, integridade referencial e o comando em subprocesso.

## Etapa 4 — cache-aside

`RuntimeServices.cached_repositories.transaction()` retorna consultas em `users`,
`clients` e `notifications`. Consultas retornam snapshots JSON seguros (datas UTC),
sem hash de senha, Google sub ou versão de sessão. `.db` expõe os repositórios SQL
na mesma transação para alterações e consultas autoritativas de autenticação.
Não use snapshots cacheados para autorizar sessões ou decisões administrativas.

```python
with services.cached_repositories.transaction() as repos:
    clients = repos.clients.list(niche="varejo", limit=50)
with services.cached_repositories.transaction() as repos:
    row = repos.db.clients.get(client_id)
    repos.db.clients.update(row, contract_closed=True)
```

Miss consulta SQL e preenche Redis com CACHE_TTL_SECONDS. Null e listas vazias também
são cacheados. Chaves incluem hash dos filtros e namespace do banco. Escritas são
rastreadas na sessão e invalidam gerações por tabela APÓS commit, inclusive usando
`services.repositories`. Rollbacks não invalidam; consultas após uma alteração
na transação ignoram cache e não publicam dados não confirmados.
Uma operação Lua impede uma consulta lenta de preencher uma geração já invalidada.
Entradas antigas expiram pelo TTL, sem KEYS/FLUSHDB em produção.

Cache-aside não oferece consistência forte: entre commit e invalidação há uma janela;
crash/falha Redis na invalidação ou alterações SQL fora do manager podem manter snapshots
até o TTL. Falha do cache retorna ao banco e não desfaz um commit concluído. Autenticação
sempre deverá consultar o banco. O Redis de cache pode conter dados de clientes: a
infraestrutura precisa restringir quem pode ler/escrever esses dados.

## Etapa 5 — bcrypt e JWT

PasswordHasher usa bcrypt com salt aleatório e custo 12. Novas senhas têm no mínimo
12 caracteres e no máximo 72 bytes UTF-8; nunca são truncadas. Verify retorna false
para senha incorreta, hash inválido e contas sem senha local (Google).

JWTService fixa HS256, issuer nexo-backend e audience nexo-admin. Exige e valida
sub, ver, jti, iat, nbf, exp, iss, aud e kind=access; não inclui senhas ou permissões.
A assinatura e todas as claims são verificadas antes de qualquer uso do token.
JWT_EXPIRE_MINUTES limita a validade. Tokens são assinados, não criptografados.

SessionSecurity.authenticate consulta SQL diretamente, nunca snapshots cacheados.
Usuários removidos/rejeitados e tokens com versão divergente são recusados.
Pending pode autenticar, mas não tem autorização para dados (etapas 6/8).
Revoke_all incrementa a versão por UPDATE SQL atômico: invalida todas as sessões
após commit. Mudança de senha/status também incrementa essa versão. Rollback preserva
sessões anteriores. A invalidação de cache continua ocorrendo depois do commit.
A etapa 6 adiciona login/logout HTTP e cookie.
Testes de hash usam custo 4 para velocidade; produção usa 12.


## Etapa 6 — autenticação HTTP

A inicialização cria tabelas ausentes e, quando ADMIN_EMAIL e ADMIN_PASSWORD estão
configurados, cria o administrador approved/admin. Repetir preserva senha, nome e versão
já salvos. Um e-mail pertencente a um membro não é promovido pelo bootstrap; a aplicação
recusa iniciar. ADMIN_PASSWORD é senha própria do painel, não a senha de aplicativo Gmail.
No desenvolvimento, deixar esse par vazio permite iniciar sem administrador. A produção
exige ambos. create-tables continua sendo um comando sem bootstrap e sem migrações.

| Rota | Comportamento |
| --- | --- |
| POST /auth/register | nome, email, phone e password; retorna conta pending/member |
| POST /auth/login | email e password; define cookie JWT HttpOnly |
| GET /auth/me | retorna somente o próprio perfil seguro |
| GET /auth/csrf | retorna csrf_token vinculado à sessão autenticada |
| POST /auth/logout | exige CSRF; revoga todas as sessões e remove cookie |

O JWT não aparece no JSON e não é aceito via Authorization. O cookie tem Path=/,
Max-Age=JWT_EXPIRE_MINUTES*60, SameSite e Secure vindos da configuração. HttpOnly impede
leitura por JavaScript/TypeScript; use fetch com credentials: "include". Isso não impede
scripts de realizar requisições, portanto a aplicação também precisa evitar XSS.

Requisições POST/PUT/PATCH/DELETE exigem Origin exata em CORS_ORIGINS, inclusive
login/cadastro. Demais mutações exigem X-CSRF-Token obtido em GET /auth/csrf. O código
CSRF é HMAC vinculado ao jti e não contém o JWT; uma sessão nova exige código novo.
Respostas /auth/* usam Cache-Control: no-store; erros de validação não repetem inputs.
Erros de login são genéricos, inclusive para conta inexistente ou rejeitada.

Contas pending só acessam o próprio perfil e código CSRF. Dependências approved_user
/admin_user consultam SQL para autorização; dados de clientes ainda não estão expostos.
Upload e limites por Redis
serão implementados nas próximas etapas. A etapa 9 adiciona e-mail de cadastro quando Gmail está configurado.


## Etapa 7 — Google OpenID Connect

Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REDIRECT_URI no ambiente.
Cadastre exatamente GOOGLE_REDIRECT_URI como URI de redirecionamento autorizada no
cliente OAuth Web do Google Cloud. Exemplo local: http://localhost:8000/auth/google/callback.
Sem esse par de credenciais, a rota de início responde 503. Não colocar secrets no frontend.

| Rota | Comportamento |
| --- | --- |
| GET /auth/google/login | navegar pelo browser; redireciona ao Google |
| GET /auth/google/callback | troca código e verifica identidade, sem tokens na URL do frontend |
| GET /auth/google/profile | nome/e-mail verificado e CSRF para completar cadastro |
| POST /auth/google/complete | name e phone; exige Origin e X-CSRF-Token do perfil |

State fica no Redis por 300 segundos e é vinculado a cookie HttpOnly exclusivo do browser.
Consumo usa GETDEL (Redis 6.2+) para impedir replay. PKCE S256 protege a troca do código;
nonce, assinatura RS256/JWKS Google, issuer, audience, azp, validade e email_verified são
validados antes de usar a identidade. Nenhum access/refresh/id token do Google é salvo.
Rede Google tem timeout de 10 segundos; erros não expõem códigos ou secrets. Redis
indisponível falha de forma fechada para esse fluxo, ao contrário do cache de consultas.

Identidade existente é encontrada pelo Google sub. Contas rejected são recusadas;
pending segue sem acesso a dados. E-mail igual ao cadastro local não causa vínculo nem
promoção automática: vinculação autenticada fica fora desta etapa. Administrador local
continua entrando com a senha do painel.

Conta nova recebe cookie HttpOnly temporário de perfil, válido por 600 segundos, sem
sessão autenticada e sem registro SQL até informar nome e celular. O frontend é redirecionado
para FRONTEND_URL/admin/complete-profile; após completar, recebe cookie JWT e conta
pending/member. Login existente redireciona para FRONTEND_URL/admin. Essas telas serão
construídas na etapa do frontend. Respostas auth usam no-store. Cookies OAuth usam Lax
para permitir callback por navegação do Google, mesmo se o cookie de sessão usa Strict.

Testes assinam tokens com RSA temporário, substituem endpoints Google por MockTransport
e usam Redis local. Nunca fazem login Google real nem usam credenciais do desenvolvedor.


## Etapa 8 — notificações e aprovação

Cadastro por senha ou conclusão do perfil Google cria uma notificação approval_request
para o administrador principal na mesma transação SQL que a conta. Não há envio de e-mail
nesta etapa: são notificações do painel, consultadas por HTTP. O frontend poderá exibir
notificação/toast e atualizar periodicamente essa lista na etapa do painel.

| Rota | Comportamento (somente administrador aprovado) |
| --- | --- |
| GET /admin/users | perfis seguros; filtro status e paginação limit/offset |
| GET /admin/notifications | somente notificações próprias; filtro unresolved_only |
| PATCH /admin/notifications/{id}/read | marca leitura sem alterar a primeira data |
| POST /admin/notifications/{id}/decision | decision=approved ou rejected |

POST/PATCH exigem Origin e X-CSRF-Token da sessão. As listagens usam cache-aside; a
identidade, versão da sessão e role/status são revalidadas diretamente no SQL. Listas
limitam a 100 registros por página e não retornam hash, Google sub ou versão da sessão.
Notificações de outra pessoa respondem 404. Usuários pendentes ou membros aprovados não
acessam essas rotas administrativas.

Decisão é atômica: encerra a notificação e muda apenas uma conta pending/member.
UPDATE condicional impede decidir duas vezes; repetição retorna 409. Na aprovação, a sessão
pendente continua válida e as permissões são liberadas na próxima consulta autoritativa SQL,
sem exigir novo login. Na rejeição, a versão da sessão é incrementada e os cookies anteriores
são invalidados. Rejeição impede login local e Google. Não há promoção a admin,
reabertura de pedidos nem alterações da conta do administrador por essas rotas.

Se contas foram criadas no desenvolvimento antes de configurar ADMIN_EMAIL/PASSWORD,
a inicialização cria os pedidos pendentes que faltam. INSERT SELECT com NOT EXISTS
impede duplicatas de pedidos abertos. Repetir a inicialização preserva decisões e leitura.
Falha ao criar notificação desfaz o cadastro; falha ao alterar usuário desfaz a decisão.
Invalidação do cache ocorre somente depois de commit; falha Redis de cache mantém fallback
SQL e o limite de consistência do TTL descrito na etapa 4.


## Etapa 9 — senha, códigos e e-mails em threads

| Rota | Entrada |
| --- | --- |
| POST /auth/password/change | current_password e new_password; sessão e CSRF obrigatórios |
| POST /auth/password/recovery/request | email; Origin obrigatório, sem sessão necessária |
| POST /auth/password/recovery/confirm | email, code e new_password; Origin obrigatório |

Novas senhas seguem bcrypt (12 caracteres, até 72 bytes UTF-8). Troca/redefinição retorna
204, revoga todas as sessões e remove cookie no browser que fez o pedido. Login deve ser
feito novamente com a nova senha. Nenhuma operação altera role/status ou aprova contas.
Contas somente Google continuam usando Google; este fluxo não cria senha local para elas.
Rejeitados não recebem código nem podem redefinir senha por estas rotas.

Código de 8 dígitos é gerado com secrets; Redis guarda apenas HMAC vinculado ao e-mail,
identificador do usuário e versão de sessão. EMAIL_CODE_TTL_SECONDS controla validade,
EMAIL_CODE_MAX_ATTEMPTS limita erros e EMAIL_CODE_RESEND_COOLDOWN_SECONDS (novo, padrão
60) limita reenvios por endereço. Lua faz emissão, contagem de tentativas e consumo único
atomicamente. Novo envio substitui o código anterior após o intervalo. Mudança prévia de
senha/rejeição invalida códigos antigos pela versão autoritativa no SQL.

Pedidos retornam o mesmo 202 para endereço elegível, desconhecido, conta Google ou
rejeitada; apenas contas locais elegíveis recebem mensagem. Cooldown também é aplicado
para desconhecidos. Gmail não configurado ou Redis indisponível responde 503 genérico;
falhas/lotação de envio mantêm resposta 202 sem revelar existência da conta.

Yagmail envia no ThreadPoolExecutor já existente, com fila limitada e timeout SMTP.
Erro de entrega remove somente o desafio correspondente, preservando reenvios posteriores;
falta de Redis no cleanup deixa o código expirar naturalmente. Não há Celery nem worker.
Código não aparece no JSON, logs ou cache de consultas. Respostas auth usam no-store.

Após commit do cadastro local/Google, envio de boas-vindas informa que a conta aguarda
aprovação. É best effort: Gmail não configurado ou falha de envio não desfaz o cadastro.
E-mails aceitos em memória podem ser perdidos se o processo cair, sem fila durável.

Redis e SQLite não compartilham transação: código válido é consumido ANTES da alteração
SQL para impedir replay. Falha SQL preserva a senha antiga, mas exige solicitar novo código
após o cooldown. UPDATE com versão esperada impede duas redefinições concorrentes ou uso
de desafio antigo. Os testes usam SMTP substituído por mock, incluindo execução real das
threads do transporte; nenhum e-mail é enviado ao Gmail real.
