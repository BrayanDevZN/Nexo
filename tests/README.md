# Testes do backend

Executar na raiz: `python -m pytest tests`.

Cada camada ganha seus testes em `tests/unit/<camada>`,
`tests/integration/<camada>` e `tests/functional/<camada>` conforme implementada.
Não criar testes vazios para funcionalidades futuras.

- Unit: validação de configuração e invariantes, sem serviços externos.
- Integration: precedência entre dotenv/ambiente e configuração da aplicação.
- Functional: contrato HTTP e execução real do comando de configuração.

Nesta etapa, nenhum teste acessa Gmail, Google, Redis público ou banco de produção.
Etapa 2 adiciona SQLAlchemy com SQLite temporário, Redis local real e yagmail com SMTP mockado.
Defina REDIS_TEST_URL para Redis local; os workflows já fazem isso.
