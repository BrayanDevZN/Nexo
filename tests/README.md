# Testes do backend

Execute na raiz: `REDIS_TEST_URL=redis://127.0.0.1:6379/15 python -m pytest tests`.

- `unit/<camada>`: invariantes e comportamentos isolados, sem serviços externos.
- `integration/<camada>`: conexões, transações e componentes combinados.
- `functional/<camada>`: contratos HTTP e comandos reais.
- `functional/system`: ciclo completo de conta aprovada, clientes, perfil, senha e logout.

SQLite e arquivos são temporários; Redis é local real. Google usa identidades
sintéticas e endpoints simulados; yagmail usa SMTP mockado com threads reais.
Não use Redis de produção: o fixture aceita apenas hosts locais/de CI.
Sem REDIS_TEST_URL os testes dependentes de Redis são pulados; CI define a variável.

GitHub Actions executa as três categorias e a suíte completa em Python 3.12/3.13.
Relatórios JUnit ficam anexados às execuções por sete dias.
