const DEFAULT_BASE_URL = 'https://nexo-production-60a0.up.railway.app';

function safeFilename(value) {
	return String(value || 'file')
		.replace(/[\r\n"\\]/g, '_')
		.slice(0, 180);
}

function multipart(fields, files) {
	const boundary = `----n8nNexo${require('crypto').randomBytes(18).toString('hex')}`;
	const chunks = [];
	for (const [name, value] of Object.entries(fields)) {
		if (value === undefined || value === null || value === '') continue;
		chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${String(value)}\r\n`));
	}
	for (const file of files) {
		if (!file || !Buffer.isBuffer(file.data)) continue;
		chunks.push(Buffer.from(
			`--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${safeFilename(file.fileName)}"\r\nContent-Type: ${file.mimeType || 'application/octet-stream'}\r\n\r\n`,
		));
		chunks.push(file.data);
		chunks.push(Buffer.from('\r\n'));
	}
	chunks.push(Buffer.from(`--${boundary}--\r\n`));
	return {
		body: Buffer.concat(chunks),
		contentType: `multipart/form-data; boundary=${boundary}`,
	};
}

function encodedPath(value) {
	return encodeURIComponent(String(value));
}

function parseFilename(headers, fallback) {
	const disposition = headers?.['content-disposition'] || headers?.['Content-Disposition'] || '';
	const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
	if (encoded) {
		try { return decodeURIComponent(encoded); } catch { /* use the plain filename below */ }
	}
	const plain = disposition.match(/filename="?([^";]+)"?/i)?.[1];
	return plain ? plain : fallback;
}

const resourceOptions = [
	{ name: 'Clientes', value: 'clients' },
	{ name: 'Automações', value: 'automations' },
	{ name: 'Documentos', value: 'documents' },
	{ name: 'Notificações', value: 'notifications' },
	{ name: 'Dashboard', value: 'dashboard' },
	{ name: 'Avisos administrativos', value: 'announcements' },
];

const operationOptions = {
	clients: [
		{ name: 'Listar', value: 'list' },
		{ name: 'Buscar por ID', value: 'get' },
		{ name: 'Criar', value: 'create' },
		{ name: 'Atualizar', value: 'update' },
		{ name: 'Excluir', value: 'delete' },
	],
	automations: [
		{ name: 'Listar', value: 'list' },
		{ name: 'Salvar arquivo', value: 'create' },
		{ name: 'Baixar arquivo', value: 'download' },
		{ name: 'Baixar imagem', value: 'image' },
	],
	documents: [
		{ name: 'Listar', value: 'list' },
		{ name: 'Enviar arquivo', value: 'upload' },
		{ name: 'Baixar arquivo', value: 'download' },
		{ name: 'Excluir', value: 'delete' },
	],
	notifications: [
		{ name: 'Listar', value: 'list' },
		{ name: 'Contar não lidas', value: 'unreadCount' },
		{ name: 'Marcar notificação como lida', value: 'markRead' },
		{ name: 'Marcar chat como lido', value: 'markChatRead' },
	],
	dashboard: [{ name: 'Obter resumo', value: 'get' }],
	announcements: [{ name: 'Criar aviso', value: 'create' }],
};

const fields = [];
function addField(displayName, name, type, defaults, extra = {}) {
	fields.push({ displayName, name, type, default: defaults, ...extra });
}

addField('Recurso', 'resource', 'options', 'clients', { options: resourceOptions, noDataExpression: true });
addField('Operação', 'operation', 'options', 'list', {
	// Keep a non-empty static list: n8n versions used in production inject
	// their proxy-auth option by reading the final option's `name`.
	options: [...new Map(Object.values(operationOptions).flat().map((option) => [option.value, option])).values()],
	noDataExpression: true,
	displayOptions: { show: { resource: Object.keys(operationOptions) } },
});

function add(displayName, name, type, defaultValue, resource, operations, extra = {}) {
	addField(displayName, name, type, defaultValue, {
		displayOptions: { show: { resource: [resource], operation: operations } },
		...extra,
	});
}

add('ID do cliente', 'identifier', 'string', '', 'clients', ['get', 'update', 'delete'], { required: true });
add('Nome', 'name', 'string', '', 'clients', ['create', 'update']);
add('Nicho', 'niche', 'string', '', 'clients', ['create', 'update']);
add('Telefone', 'phone', 'string', '', 'clients', ['create', 'update']);
add('E-mail', 'email', 'string', '', 'clients', ['create', 'update']);
add('Etapa do funil', 'pipelineStage', 'options', '', 'clients', ['list', 'create', 'update'], {
	options: [
		{ name: 'Não alterar / sem filtro', value: '' },
		{ name: 'Lead', value: 'lead' },
		{ name: 'Contato feito', value: 'contacted' },
		{ name: 'Proposta', value: 'proposal' },
		{ name: 'Diagnóstico', value: 'diagnosis' },
		{ name: 'Negociação', value: 'negotiation' },
		{ name: 'Ganho', value: 'won' },
		{ name: 'Perdido', value: 'lost' },
	],
});
add('Contrato fechado', 'contractClosed', 'options', 'unchanged', 'clients', ['create', 'update'], {
	options: [
		{ name: 'Não alterar (ou não fechado ao criar)', value: 'unchanged' },
		{ name: 'Sim', value: 'true' },
		{ name: 'Não', value: 'false' },
	],
});
add('Valor do contrato', 'contractValue', 'number', null, 'clients', ['create', 'update']);
add('Observações', 'notes', 'string', '', 'clients', ['create', 'update'], { typeOptions: { rows: 3 } });
add('Próximo acompanhamento', 'nextFollowUp', 'dateTime', '', 'clients', ['create', 'update']);
add('Dor identificada', 'pain', 'string', '', 'clients', ['create', 'update'], { typeOptions: { rows: 3 } });
add('Abordagem', 'approach', 'string', '', 'clients', ['create', 'update'], { typeOptions: { rows: 3 } });
add('Filtrar por nicho', 'filterNiche', 'string', '', 'clients', ['list']);
add('Filtrar por nome', 'filterName', 'string', '', 'clients', ['list']);
add('ID do criador', 'createdById', 'string', '', 'clients', ['list']);
add('Filtrar por contrato fechado', 'filterContractClosed', 'options', 'all', 'clients', ['list'], {
	options: [{ name: 'Todos', value: 'all' }, { name: 'Sim', value: 'true' }, { name: 'Não', value: 'false' }],
});

for (const resource of ['clients', 'automations', 'documents', 'notifications']) {
	for (const operation of operationOptions[resource]) {
		if (['list', 'create', 'upload'].includes(operation.value)) {
			const visibleOps = resource === 'clients' ? ['list'] : [operation.value];
			if (visibleOps.includes('list')) {
				add('Limite', 'limit', 'number', 50, resource, ['list'], { typeOptions: { minValue: 1, maxValue: 100 } });
				add('Deslocamento', 'offset', 'number', 0, resource, ['list'], { typeOptions: { minValue: 0 } });
			}
		}
	}
}
add('ID da automação', 'identifier', 'string', '', 'automations', ['download', 'image'], { required: true });
add('Nome', 'automationName', 'string', '', 'automations', ['create'], { required: true });
add('Descrição', 'automationDescription', 'string', '', 'automations', ['create'], { required: true, typeOptions: { rows: 3 } });
add('Propriedade binária do arquivo', 'fileBinaryProperty', 'string', 'data', 'automations', ['create'], { required: true });
add('Propriedade binária da imagem', 'imageBinaryProperty', 'string', '', 'automations', ['create']);

add('ID do cliente', 'documentClientId', 'string', '', 'documents', ['list', 'upload']);
add('Propriedade binária do arquivo', 'fileBinaryProperty', 'string', 'data', 'documents', ['upload'], { required: true });
add('ID do documento', 'identifier', 'string', '', 'documents', ['download', 'delete'], { required: true });

add('Tipo', 'notificationKind', 'options', 'all', 'notifications', ['list'], {
	options: [
		{ name: 'Todas', value: 'all' },
		{ name: 'Avisos', value: 'announcement' },
		{ name: 'Novos membros', value: 'member_joined' },
		{ name: 'Mensagens do chat', value: 'chat_message' },
		{ name: 'Solicitações de automação', value: 'automation_request' },
		{ name: 'Convites de automação', value: 'automation_invitation' },
		{ name: 'Solicitações rejeitadas', value: 'automation_rejected' },
	],
});
add('ID da notificação', 'identifier', 'string', '', 'notifications', ['markRead'], { required: true });
add('ID do membro do chat', 'memberId', 'string', '', 'notifications', ['markChatRead'], { required: true });

add('Título', 'title', 'string', '', 'announcements', ['create'], { required: true });
add('Conteúdo', 'body', 'string', '', 'announcements', ['create'], { required: true, typeOptions: { rows: 4 } });

class Nexo {
	constructor() {
		this.description = {
			displayName: 'Nexo',
			name: 'nexo',
			group: ['transform'],
			version: 1,
			subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
			description: 'Consuma os recursos da API da Nexo em workflows.',
			defaults: { name: 'Nexo', color: '#6D4AFF' },
			inputs: ['main'],
			outputs: ['main'],
			credentials: [{ name: 'nexoApi', required: true }],
			properties: fields,
		};
	}

	async execute() {
		const items = this.getInputData();
		const returnData = [];
		const resource = this.getNodeParameter('resource', 0);
		const operation = this.getNodeParameter('operation', 0);
		const credentials = await this.getCredentials('nexoApi');
		const baseUrl = String(credentials.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');

		for (let i = 0; i < items.length; i++) {
			let method = 'GET';
			let path = '';
			let qs = {};
			let body;
			let headers = {};
			let binaryResult = false;
			let fallbackFilename = 'nexo-file';

			if (resource === 'dashboard') {
				path = '/dashboard';
			} else if (resource === 'clients') {
				const identifier = this.getNodeParameter('identifier', i, '');
				if (operation === 'list') {
					path = '/clients';
					qs = { limit: this.getNodeParameter('limit', i, 50), offset: this.getNodeParameter('offset', i, 0) };
					const queryFields = {
						niche: this.getNodeParameter('filterNiche', i, ''),
						name: this.getNodeParameter('filterName', i, ''),
						created_by_id: this.getNodeParameter('createdById', i, ''),
					};
					for (const [key, value] of Object.entries(queryFields)) if (value) qs[key] = value;
					const contractClosed = this.getNodeParameter('filterContractClosed', i, 'all');
					if (contractClosed !== 'all') qs.contract_closed = contractClosed;
					const stage = this.getNodeParameter('pipelineStage', i, '');
					if (stage) qs.pipeline_stage = stage;
				} else if (operation === 'get') {
					path = `/clients/${encodedPath(identifier)}`;
				} else if (operation === 'create' || operation === 'update') {
					method = operation === 'create' ? 'POST' : 'PATCH';
					path = operation === 'create' ? '/clients' : `/clients/${encodedPath(identifier)}`;
					body = {};
					for (const [field, apiField, kind] of [
						['name', 'name', 'string'], ['niche', 'niche', 'string'], ['phone', 'phone', 'string'],
						['email', 'email', 'string'], ['pipelineStage', 'pipeline_stage', 'string'],
						['contractValue', 'contract_value', 'number'], ['notes', 'notes', 'string'],
						['nextFollowUp', 'next_follow_up', 'string'], ['pain', 'pain', 'string'], ['approach', 'approach', 'string'],
					]) {
						const value = this.getNodeParameter(field, i, undefined);
						if (value !== undefined && value !== null && value !== '' && (kind !== 'string' || value !== '')) body[apiField] = value;
					}
					const contractClosed = this.getNodeParameter('contractClosed', i, 'unchanged');
					if (contractClosed !== 'unchanged') body.contract_closed = contractClosed === 'true';
					else if (operation === 'create') body.contract_closed = false;
					if (operation === 'create' && !body.pipeline_stage) body.pipeline_stage = 'lead';
					if (operation === 'create' && (!body.name || !body.niche)) {
						throw new Error('Para criar um cliente, preencha Nome e Nicho.');
					}
				} else {
					method = 'DELETE'; path = `/clients/${encodedPath(identifier)}`;
				}
			} else if (resource === 'automations') {
				if (operation === 'list') {
					path = '/automations';
					qs = { limit: this.getNodeParameter('limit', i, 50), offset: this.getNodeParameter('offset', i, 0) };
				} else if (operation === 'create') {
					method = 'POST'; path = '/automations';
					const fileField = this.getNodeParameter('fileBinaryProperty', i, 'data');
					const fileInfo = items[i].binary?.[fileField];
					if (!fileInfo) throw new Error(`Arquivo binário "${fileField}" não encontrado no item ${i + 1}.`);
					const fileData = await this.helpers.getBinaryDataBuffer(i, fileField);
					const files = [{ field: 'file', fileName: fileInfo.fileName || 'automation.json', mimeType: fileInfo.mimeType || 'application/octet-stream', data: fileData }];
					const imageField = this.getNodeParameter('imageBinaryProperty', i, '');
					if (imageField && items[i].binary?.[imageField]) {
						const imageInfo = items[i].binary[imageField];
						files.push({ field: 'image', fileName: imageInfo.fileName || 'image.jpg', mimeType: imageInfo.mimeType || 'image/jpeg', data: await this.helpers.getBinaryDataBuffer(i, imageField) });
					}
					const form = multipart({
						name: this.getNodeParameter('automationName', i),
						description: this.getNodeParameter('automationDescription', i),
					}, files);
					body = form.body; headers['Content-Type'] = form.contentType;
				} else {
					const identifier = encodedPath(this.getNodeParameter('identifier', i));
					path = operation === 'download' ? `/automations/${identifier}/download` : `/automations/${identifier}/image`;
					binaryResult = true;
					fallbackFilename = operation === 'image' ? 'automation-image.jpg' : 'automation.json';
				}
			} else if (resource === 'documents') {
				if (operation === 'list') {
					path = '/documents';
					qs = { limit: this.getNodeParameter('limit', i, 50), offset: this.getNodeParameter('offset', i, 0) };
					const clientId = this.getNodeParameter('documentClientId', i, '');
					if (clientId) qs.client_id = clientId;
				} else if (operation === 'upload') {
					method = 'POST'; path = '/documents';
					const fileField = this.getNodeParameter('fileBinaryProperty', i, 'data');
					const fileInfo = items[i].binary?.[fileField];
					if (!fileInfo) throw new Error(`Arquivo binário "${fileField}" não encontrado no item ${i + 1}.`);
					const form = multipart({}, [{ field: 'file', fileName: fileInfo.fileName || 'document', mimeType: fileInfo.mimeType || 'application/octet-stream', data: await this.helpers.getBinaryDataBuffer(i, fileField) }]);
					body = form.body; headers['Content-Type'] = form.contentType;
					const clientId = this.getNodeParameter('documentClientId', i, '');
					if (clientId) qs.client_id = clientId;
				} else if (operation === 'download') {
				path = `/documents/${encodedPath(this.getNodeParameter('identifier', i))}/download`;
				binaryResult = true; fallbackFilename = 'document';
			} else {
				method = 'DELETE'; path = `/documents/${encodedPath(this.getNodeParameter('identifier', i))}`;
			}
		} else if (resource === 'notifications') {
			if (operation === 'list') {
				path = '/notifications';
				qs = { limit: this.getNodeParameter('limit', i, 50), offset: this.getNodeParameter('offset', i, 0) };
				const kind = this.getNodeParameter('notificationKind', i, 'all');
				if (kind !== 'all') qs.kind = kind;
			} else if (operation === 'unreadCount') {
				path = '/notifications/unread-count';
			} else if (operation === 'markRead') {
				method = 'PATCH'; path = `/notifications/${encodedPath(this.getNodeParameter('identifier', i))}/read`;
			} else {
				method = 'PATCH'; path = `/notifications/chat/${encodedPath(this.getNodeParameter('memberId', i))}/read`;
			}
		} else if (resource === 'announcements') {
			method = 'POST'; path = '/admin/announcements';
			body = { title: this.getNodeParameter('title', i), body: this.getNodeParameter('body', i) };
		}

		const response = await this.helpers.httpRequestWithAuthentication.call(this, 'nexoApi', {
			method,
			baseURL: `${baseUrl}/`,
			url: path.replace(/^\//, ''),
			qs,
			body,
			headers,
			json: !binaryResult,
			returnFullResponse: binaryResult,
			encoding: binaryResult ? 'arraybuffer' : 'json',
			timeout: 30000,
		});

		if (binaryResult) {
			const payload = response?.body ?? response;
			const buffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
			const fileName = parseFilename(response?.headers, fallbackFilename);
			const binary = await this.helpers.prepareBinaryData(buffer, fileName, response?.headers?.['content-type']);
			returnData.push({ json: { fileName, mimeType: binary.mimeType }, binary: { data: binary }, pairedItem: { item: i } });
			continue;
		}

		if (Array.isArray(response)) {
			for (const row of response) returnData.push({ json: row, pairedItem: { item: i } });
		} else if (response === undefined || response === null) {
			returnData.push({ json: { success: true }, pairedItem: { item: i } });
		} else {
			returnData.push({ json: response, pairedItem: { item: i } });
		}
		}

		return [returnData];
	}
}

module.exports = { Nexo };

