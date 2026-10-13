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
| Clientes | Listar, buscar por ID, criar, atualizar e excluir |
| Automações | Listar, salvar arquivo, baixar arquivo e baixar imagem |
| Documentos | Listar, enviar arquivo, baixar arquivo e excluir |
| Notificações | Listar, contar não lidas, marcar notificação como lida e marcar chat como lido |
| Dashboard | Obter resumo |
| Avisos administrativos | Criar aviso |

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
