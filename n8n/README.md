# Node Nexo para n8n

Node privado para consumir a API documentada na aba **API** do painel Nexo.
O código fica separado em `nodes/` e `credentials/`; o `Dockerfile.n8n` da raiz
adiciona esses arquivos à imagem oficial `n8nio/n8n:latest`.

## Credencial

No n8n, crie uma credencial **Nexo API** com:

- **Base URL:** `https://nexo-production-60a0.up.railway.app`
- **API Key:** uma chave criada pelo próprio usuário na seção API da Nexo

A chave é armazenada pelo n8n na credencial. O node envia `Authorization: Bearer <chave>`
e usa a Base URL configurada; ela não está hardcoded no workflow.

## Recursos e operações

| Recurso | Operações |
| --- | --- |
| Clientes | Listar com filtro de nicho fechado, contrato fechado e nome; buscar por ID ou nome; criar, atualizar e excluir |
| Automações | Listar, salvar arquivo, baixar arquivo e baixar imagem |
| Documentos | Listar, enviar arquivo, baixar arquivo e excluir |
| Notificações | Listar, contar não lidas, marcar notificação como lida e marcar chat como lido |
| Dashboard | Obter resumo |
| Avisos administrativos | Criar aviso |

O node **Nexo** também pode ser conectado à porta de ferramentas do **AI Agent**.
As operações retornam JSON em envelope estável: `success`, `resource`, `operation` e `data`.
Listagens devolvem um item n8n por registro, com `data` contendo o registro; a saída
também traz `count`. Uma lista vazia produz um item com `count: 0` e `data: []`.
Arquivos baixados aparecem em `binary.data`, com nome e MIME type em `json.file`.
O trigger usa `success`, `source`, `event` e `data` para separar metadados do aviso.

O agente recebe os nomes das operações em linguagem clara e os campos do recurso;
restrinja a chave API e as instruções do agente às ações que ele realmente deve executar.

O **Nexo Trigger** inicia workflows por polling de notificações da API. Ele pode
filtrar avisos da equipe, novos clientes, contratos fechados, novos membros, mensagens
do chat e eventos de automação. Como a API não oferece um webhook de saída, o trigger
consulta a lista a cada ciclo de polling do n8n. A primeira consulta cria uma referência
e não dispara todo o histórico; em teste manual, retorna uma notificação existente como amostra.

Conecte a credencial **Nexo API** ao node de ação, ao **Nexo Trigger** e ao node Nexo
usado como ferramenta do **AI Agent**. Para habilitar o node como ferramenta, ligue-o
à entrada **Tool** do agente.

Uploads recebem o arquivo de uma propriedade binária do item de entrada. Para salvar
uma automação, informe também nome e descrição; a propriedade binária de imagem é opcional.
Downloads retornam os dados em uma propriedade binária `data`.

As operações respeitam as permissões existentes na API Nexo. Criar avisos, por exemplo,
requer uma chave de um administrador; uma chave de membro comum recebe a resposta 403.

## Build local da imagem

Na raiz deste repositório:

```sh
docker build -f Dockerfile.n8n -t nexo-n8n:local .
```

O Dockerfile mantém `n8nio/n8n:latest` como base e instala o node em
`/opt/n8n-custom`, via `N8N_CUSTOM_EXTENSIONS`. Esse diretório fica fora do volume de
dados do n8n, então o código do node não sobrescreve os dados persistidos.

## Deploy pelo Railway

O serviço precisa passar a construir a imagem a partir deste repositório Nexo:

1. Conecte o repositório Nexo ao serviço n8n no Railway.
2. Configure o Dockerfile como `Dockerfile.n8n`, com a raiz do repositório como contexto.
3. Preserve o volume, o mount path, a variável `N8N_USER_FOLDER` e a chave de
   criptografia já usados pelo serviço. Faça backup do volume antes do primeiro deploy.
4. Depois do deploy, reinicie/abra o editor e verifique se o node **Nexo** aparece.

O código do node não grava nada no banco nem no volume. O volume segue sendo de dados;
esta imagem só acrescenta os arquivos do node ao container.

## Endpoints

Os caminhos e campos seguem a documentação visual em
`src/frontend/admin/ApiDocumentation.tsx` e as rotas correspondentes em
`src/backend/controller/handles/`. A API está em produção com OpenAPI desativado;
para mudar operações, mantenha esta integração alinhada com esses dois pontos.
