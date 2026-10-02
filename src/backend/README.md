# Backend Nexo — etapas 1 e 2

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

As camadas futuras têm apenas os pacotes Python; autenticação, CRUD, criação de tabelas
e rate limiting ainda não foram implementados. A etapa 2 implementa as conexões e o
transporte de e-mail, sem expor rotas de envio.
O comando para criar tabelas será implementado com os models na etapa 3.

## Ambiente

`.env` é lido da raiz por caminho absoluto, independentemente do diretório atual.
Variáveis do processo têm prioridade. `.env.example` documenta todas as opções sem secrets.
Os paths relativos de SQLite e uploads são relativos ao diretório de execução;
rode da raiz ou use paths absolutos em produção (volume persistente).

JWT_SECRET_KEY é obrigatório (mínimo 32 caracteres). Pares de credenciais são opcionais
no desenvolvimento, mas devem estar completos. Produção exige admin, cookies Secure e
URLs HTTPS. SameSite=None exige Secure. Senhas/URL Redis não aparecem no repr nem nos
erros do CLI. CORS aceita apenas origens explícitas. Ajuste SameSite e origens aos domínios
reais no deploy. A autenticação e proteção CSRF ainda serão implementadas.

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
