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
| Clientes | Get Many com filtros de nicho, contrato fechado e nome; Get por ID; buscar por ID ou nome; criar, atualizar e excluir |
| Automações | Get Many; Get por ID; salvar arquivo, baixar arquivo e baixar imagem |
| Documentos | Get Many; Get por ID; enviar arquivo, baixar arquivo e excluir |
| Notificações | Get Many; Get por ID; contar não lidas, marcar notificação como lida e marcar chat como lido |
| Dashboard | Obter resumo |
| Avisos administrativos | Criar aviso |

O node de ações **Nexo** pode ser conectado à entrada **Tool** do **AI Agent**
(`usableAsTool`). Configure uma operação por node — por exemplo, um node para
buscar clientes e outro para cadastrar clientes — e conecte cada um à porta Tool.
Nas propriedades que o agente deve preencher, use **Let the model define this
parameter** e dê uma descrição clara; recurso e operação são escolhidos no node.
Operações que enviam arquivos precisam receber o binário de outro node do workflow.
O **Nexo Trigger** inicia workflows por polling e não é uma ferramenta de chamada
sob demanda do agente.

As operações seguem o formato padrão do n8n: cada registro retorna como um item
independente, com os campos diretamente no JSON (sem envelope `data`). Uma lista vazia
gera zero itens. Arquivos baixados aparecem em `binary.data`, acompanhados por
`json.fileName` e `json.mimeType`. O trigger também retorna os campos da notificação
diretamente no JSON de cada item.

O **Nexo Trigger** cria uma assinatura em `/event-subscriptions` ao ativar o workflow.
A Nexo envia um POST para o webhook HTTPS do n8n assim que o evento acontece; não há
polling nem espera entre ciclos. Ao desativar o workflow, o node remove a assinatura.
O item de saída é o conteúdo de `data` do evento, diretamente em `json`.

Os eventos disponíveis são: avisos da equipe, clientes novos, automações novas,
contratos fechados, membros aprovados, mensagens do chat e solicitações/decisões de
automação. A URL pública do n8n precisa usar HTTPS e resolver para um endereço IP
público. O node requer uma chave API ativa de uma conta com cargo dev ou superior.

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
