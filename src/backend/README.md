# Backend Nexo — etapas 1 a 6

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
Notificações/aprovação, Google OAuth, recuperação de senha, upload e limites por Redis
serão implementados nas próximas etapas. Cadastro ainda não dispara e-mail.
