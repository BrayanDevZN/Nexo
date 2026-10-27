# Node Nexo para n8n

Node privado para consumir a API documentada na aba **API** do painel Nexo.
O código fica separado em `nodes/` e `credentials/`; o `Dockerfile.n8n` da raiz
adiciona esses arquivos à imagem oficial `n8nio/n8n:latest`.

## Credencial

No n8n, crie uma credencial **Nexo API** com:

- **Base URL:** `https://nexo-production-60a0.up.railway.app`
- **Maps URL:** `https://nexo-production-52a1.up.railway.app` (servidor do Maps; já vem preenchida)
- **API Key:** uma chave criada pelo próprio usuário na seção API da Nexo

A chave é armazenada pelo n8n na credencial. O node envia `Authorization: Bearer <chave>`
e usa a Base URL configurada; ela não está hardcoded no workflow.

## Recursos e operações

| Recurso | Operações |
| --- | --- |
| Clientes | Get Many com filtros de nicho, canal de vendas, etapa, contrato fechado e nome; Get por ID; buscar por ID ou nome; criar, atualizar e excluir |
| Automações | Get Many; Get por ID; salvar arquivo, baixar arquivo e baixar imagem |
| Documentos | Get Many; Get por ID; enviar arquivo, baixar arquivo e excluir |
| Notificações | Get Many; Get por ID; contar não lidas, marcar notificação como lida e marcar chat como lido |
| Dashboard | Obter resumo |
| Avisos administrativos | Criar aviso |
| Maps | Criar busca; Get Many; Get (status); baixar resultados; excluir busca |

O node de ações **Nexo** pode ser conectado à entrada **Tool** do **AI Agent**
(`usableAsTool`). Configure uma operação por node — por exemplo, um node para
buscar clientes e outro para cadastrar clientes — e conecte cada um à porta Tool.
Nas propriedades que o agente deve preencher, use **Let the model define this
parameter** e dê uma descrição clara; recurso e operação são escolhidos no node.
Operações que enviam arquivos precisam receber o binário de outro node do workflow.
O **Nexo Trigger** recebe eventos por webhook e não é uma ferramenta de chamada
sob demanda do agente.

As operações seguem o formato padrão do n8n: cada registro retorna como um item
independente, com os campos diretamente no JSON (sem envelope `data`). Uma lista vazia
gera zero itens. Arquivos baixados aparecem em `binary.data`, acompanhados por
`json.fileName` e `json.mimeType`. O trigger também retorna os campos da notificação
diretamente no JSON de cada item.

O **Nexo Trigger** registra um webhook na API Nexo quando o workflow é ativado
ou quando você clica em **Listen for test event**. Selecione **Novo cliente
cadastrado** para receber o registro criado como JSON no próximo node. O teste
manual usa uma URL diferente da URL do workflow ativo; o trigger mantém as
assinaturas separadas e remove apenas a assinatura correspondente ao parar.
A URL pública do n8n precisa usar HTTPS e ser alcançável pela API Nexo.
Depois de atualizar a imagem do n8n, reinicie o serviço e reative o workflow
para cadastrar a assinatura com a versão nova do node.

Conecte a credencial **Nexo API** ao node de ação, ao **Nexo Trigger** e ao node Nexo
usado como ferramenta do **AI Agent**. Para habilitar o node como ferramenta, ligue-o
à entrada **Tool** do agente.

Uploads recebem o arquivo de uma propriedade binária do item de entrada. Para salvar
uma automação, informe também nome e descrição; a propriedade binária de imagem é opcional.
Downloads retornam os dados em uma propriedade binária `data`.

### Canal de vendas

Cada cliente pode ter um **canal de vendas** (E-mail, WhatsApp, Instagram, Ligação, Presencial ou Outro) ou ficar
sem canal. Em **Clientes → Criar**, deixe **Sem canal** para não preencher. Em **Atualizar**, **Não alterar**
mantém o valor atual e **Remover canal** deixa o cliente sem canal. **Get Many** aceita o filtro
**Filtrar por canal de vendas**, por exemplo para listar só os leads que serão abordados por e-mail.

### Maps

O recurso **Maps** fala com o servidor do Maps (`/api/v1/jobs`), que aceita a mesma chave da Nexo e
aparece na aba **API** do painel. Funciona com chave de qualquer cargo, inclusive Comercial. O fluxo é:

1. **Criar busca**: escolha o **Nicho** (só os nichos fixos do painel, cada um com os termos de busca certos) e o
   **Contato que você quer nos leads** (Qualquer, WhatsApp, E-mail ou WhatsApp e e-mail). Sem mais nada, a busca é
   em **São Paulo (SP)** (latitude `-23.5505`, longitude `-46.6333`), raio de 5000 m. Para mudar a cidade, a
   latitude, a longitude, o raio, o zoom, a profundidade, o idioma, o modo rápido ou o tempo máximo, clique em
   **Adicionar opção** (a lista de cidades é a mesma do painel; latitude e longitude, se informadas, valem mais que a
   cidade). Escolher **E-mail** ou **WhatsApp e e-mail** liga sozinho a busca de e-mails nos sites das empresas.
   Devolve `{ "id": ... }`.
2. **Get** pelo ID até o campo `Status` chegar a `ok` (começa em `working`; `failed` se não terminou).
3. **Baixar resultados** devolve uma empresa por item, com as colunas do CSV (`title`, `category`, `address`,
   `phone`, `website`, `emails`, `review_rating`, `review_count`, `link`, `latitude`, `longitude`...) e os campos extras
   `phone_e164` (telefone normalizado como `+55...`, ou `null` se não houver número válido), `is_mobile` (celular),
   `has_email` e `sales_channel`. O campo **Contato que você quer nos leads** também filtra: **WhatsApp** deixa só
   quem tem **celular** (telefone fixo quase nunca tem WhatsApp), **E-mail** só quem tem e-mail e **WhatsApp e
   e-mail** só quem tem os dois. `sales_channel` vem como `whatsapp` ou `email` quando você escolhe um só contato, e
   `null` nos outros casos, pronto para mapear em **Clientes → Criar → Canal de vendas**.
   **Quando não há nada para devolver** (a busca não achou empresas, ou nenhuma tem o contato escolhido), o node
   não devolve uma lista vazia, que pararia o fluxo: devolve **um item** com `found: 0`, `message` e `reason`
   (`no_contact`, `custom_place`, `max_radius` ou `disabled`). Use um **IF** em `found` para tratar esse caso.
   Se a busca foi no **local padrão** (uma das cidades da lista) e não achou nenhuma empresa, a opção
   **Ampliar o raio se não achar nada** (ligada por padrão) cria uma busca nova com o **dobro do raio** (5, 10, 20,
   40 e até 50 km) e o item traz `expanded: true`, `new_radius` e `new_job_id`. Espere essa busca terminar (**Get**) e
   baixe os resultados do `new_job_id`; repita enquanto `expanded` for `true`. Buscas com latitude e longitude
   informadas em **Adicionar opção** ficam só naquele perímetro: o item volta com `reason: "custom_place"`.
   **Get Many** sem nenhuma busca também devolve um item (`found: 0`).
4. **Excluir busca** apaga a busca e os resultados do servidor e devolve `{ "id": ..., "deleted": true }`.

Para levar os resultados ao funil, ligue **Baixar resultados** a um node **Clientes → Criar** mapeando
`title` → Nome, `phone_e164` → Telefone, `address` → Endereço, `sales_channel` → Canal de vendas e o nicho desejado.
Diferente do painel, essa rota não ignora duplicados: confira o funil antes (por exemplo com
**Clientes → Buscar por ID ou nome**).

**Atenção ao atualizar:** a busca deixou de aceitar palavras-chave livres. Fluxos antigos que preenchiam
palavras-chave, latitude e longitude no formulário passam a usar o nicho **Contabilidade** em São Paulo até você
escolher o nicho e, se precisar, a cidade em **Adicionar opção**.

Ficam de fora o cadastro da chave do Maps e a adição em lote ao funil do painel: elas usam a sessão do navegador,
não a chave de API. Quanto maior a profundidade da busca, mais empresas e mais demora.

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
