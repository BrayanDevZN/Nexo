# Backend Nexo — etapa 1

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

As pastas futuras têm apenas os pacotes Python; esta etapa não implementa autenticação,
CRUD, criação de tabelas, rate limiting, envio de e-mail ou conexões.
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
