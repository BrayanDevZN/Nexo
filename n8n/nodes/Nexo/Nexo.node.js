const DEFAULT_BASE_URL = 'https://nexo-production-60a0.up.railway.app';
const DEFAULT_MAPS_URL = 'https://nexo-production-52a1.up.railway.app';

function safeFilename(value) {
	return String(value || 'file').replace(/[\r\n"\\]/g, '_').slice(0, 180);
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
		chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${safeFilename(file.fileName)}"\r\nContent-Type: ${file.mimeType || 'application/octet-stream'}\r\n\r\n`));
		chunks.push(file.data);
		chunks.push(Buffer.from('\r\n'));
	}
	chunks.push(Buffer.from(`--${boundary}--\r\n`));
	return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

function encodedPath(value) { return encodeURIComponent(String(value)); }
function normalizePhone(value) { return String(value || '').replace(/\D/g, ''); }
// Same rule as the backend: numbers without a country code are Brazilian.
function phoneE164(value) {
	const raw = String(value || '').trim();
	let digits = raw.replace(/\D/g, '');
	if (!raw.startsWith('+') && (digits.length === 10 || digits.length === 11)) digits = `55${digits}`;
	return digits.length >= 10 && digits.length <= 15 ? `+${digits}` : null;
}
function parseCsv(text) {
	const rows = []; let row = [], field = '', quoted = false;
	const source = String(text || '').replace(/^\uFEFF/, '');
	for (let index = 0; index < source.length; index++) {
		const char = source[index];
		if (quoted) {
			if (char === '"') { if (source[index + 1] === '"') { field += '"'; index++; } else quoted = false; } else field += char;
		} else if (char === '"') quoted = true;
		else if (char === ',') { row.push(field); field = ''; }
		else if (char === '\n' || char === '\r') { if (char === '\r' && source[index + 1] === '\n') index++; row.push(field); field = ''; rows.push(row); row = []; }
		else field += char;
	}
	if (field !== '' || row.length) { row.push(field); rows.push(row); }
	const [header, ...records] = rows.filter((cells) => cells.some((cell) => cell !== ''));
	if (!header) return [];
	return records.map((cells) => Object.fromEntries(header.map((name, column) => [name, cells[column] ?? ''])));
}
// The niches the map search can look for and the Google Maps terms each one uses. Same list as the panel.
const MAPS_NICHES = {
	'Contabilidade': ['escritório de contabilidade', 'contador'],
	'Saúde': ['clínica médica', 'clínica odontológica', 'consultório'],
	'Beleza e estética': ['salão de beleza', 'clínica de estética', 'barbearia'],
	'Imobiliário': ['imobiliária', 'corretor de imóveis'],
	'Advocacia': ['escritório de advocacia', 'advogado'],
	'Educação': ['escola', 'curso', 'escola de idiomas'],
	'Varejo': ['loja de roupas', 'loja de calçados', 'loja de presentes'],
	'Comércio': ['loja', 'papelaria', 'mercado'],
	'Alimentação': ['restaurante', 'padaria', 'lanchonete'],
	'Tecnologia': ['empresa de tecnologia', 'empresa de software', 'assistência técnica'],
	'Construção civil': ['construtora', 'empreiteira', 'material de construção'],
	'Indústria': ['indústria', 'fábrica'],
	'Logística': ['transportadora', 'empresa de logística'],
	'Serviços profissionais': ['consultoria', 'empresa de serviços'],
	'Marketing e publicidade': ['agência de marketing', 'agência de publicidade'],
	'Automotivo': ['oficina mecânica', 'concessionária', 'autopeças'],
};
const MAPS_CITIES = [
	{ name: 'São Paulo (SP)', lat: '-23.5505', lon: '-46.6333' }, { name: 'Rio de Janeiro (RJ)', lat: '-22.9068', lon: '-43.1729' },
	{ name: 'Belo Horizonte (MG)', lat: '-19.9167', lon: '-43.9345' }, { name: 'Brasília (DF)', lat: '-15.7939', lon: '-47.8828' },
	{ name: 'Curitiba (PR)', lat: '-25.4284', lon: '-49.2733' }, { name: 'Porto Alegre (RS)', lat: '-30.0346', lon: '-51.2177' },
	{ name: 'Florianópolis (SC)', lat: '-27.5954', lon: '-48.5480' }, { name: 'Salvador (BA)', lat: '-12.9714', lon: '-38.5014' },
	{ name: 'Recife (PE)', lat: '-8.0476', lon: '-34.8770' }, { name: 'Fortaleza (CE)', lat: '-3.7319', lon: '-38.5267' },
	{ name: 'Goiânia (GO)', lat: '-16.6869', lon: '-49.2648' }, { name: 'Vitória (ES)', lat: '-20.3155', lon: '-40.3128' },
	{ name: 'Campo Grande (MS)', lat: '-20.4697', lon: '-54.6201' }, { name: 'Manaus (AM)', lat: '-3.1190', lon: '-60.0217' },
	{ name: 'Belém (PA)', lat: '-1.4558', lon: '-48.4902' },
];
const MAPS_DEFAULT_CITY = MAPS_CITIES[0];
const MAPS_MAX_RADIUS = 50000;
// A place is the default when it is one of the listed cities; a place typed by the user is searched only there.
function isDefaultPlace(lat, lon) {
	return MAPS_CITIES.some((city) => Math.abs(Number(city.lat) - Number(lat)) < 1e-6 && Math.abs(Number(city.lon) - Number(lon)) < 1e-6);
}
const kmLabel = (meters) => `${Number(meters) / 1000} km`;
const MAPS_DEFAULT_RADIUS = 5000;
// Which contact the team wants from the leads. Same choices and rules as the panel's Maps screen.
const CONTACT_CHOICES = [{ name: 'Todos os contatos', value: 'any' }, { name: 'WhatsApp (celular)', value: 'whatsapp' }, { name: 'E-mail', value: 'email' }, { name: 'Instagram', value: 'instagram' }, { name: 'Site', value: 'site' }, { name: 'WhatsApp e e-mail', value: 'both' }];
function contactChoice(value) {
	const choice = String(value || 'any');
	if (!CONTACT_CHOICES.some((option) => option.value === choice)) throw new Error('Contato inválido: escolha todos, WhatsApp, e-mail, Instagram, site ou WhatsApp e e-mail.');
	return choice;
}
// A Brazilian mobile number (area code + nine digits starting with 9). Landlines rarely have WhatsApp.
function isMobilePhone(value) {
	let digits = String(value || '').replace(/\D/g, '');
	if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2);
	return digits.length === 11 && digits[2] === '9';
}
function hasEmail(value) { return /[^\s,;@]+@[^\s,;@]+\.[^\s,;@]+/.test(String(value || '')); }
// The map gives one "website" per company: an Instagram link is the Instagram contact, and networks and link pages are not a site.
const SOCIAL_HOSTS = ['facebook.com', 'fb.com', 'fb.me', 'wa.me', 'whatsapp.com', 'linktr.ee', 'tiktok.com', 'youtube.com', 'youtu.be', 'x.com', 'twitter.com', 'linkedin.com', 'beacons.ai'];
function hostOf(url) {
	const text = String(url || '').trim();
	if (!text) return null;
	try { return new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `https://${text}`).hostname.toLowerCase().replace(/^(www|m)\./, ''); } catch { return null; }
}
const onHost = (host, domain) => host === domain || host.endsWith(`.${domain}`);
function instagramUrl(url) { const host = hostOf(url); return host && (onHost(host, 'instagram.com') || host === 'instagr.am') ? String(url).trim() : null; }
function siteUrl(url) { const host = hostOf(url); return !host || instagramUrl(url) || SOCIAL_HOSTS.some((domain) => onHost(host, domain)) ? null : String(url).trim(); }
function matchesContact(lead, choice) {
	const whatsapp = isMobilePhone(lead.phone), email = hasEmail(lead.emails);
	if (choice === 'instagram') return instagramUrl(lead.website) !== null;
	if (choice === 'site') return siteUrl(lead.website) !== null;
	return choice === 'whatsapp' ? whatsapp : choice === 'email' ? email : choice === 'both' ? whatsapp && email : true;
}
// Which contacts each choice shows. "Todos os contatos" shows them all.
function contactParts(choice) {
	return { phone: ['any', 'whatsapp', 'both'].includes(choice), email: ['any', 'email', 'both'].includes(choice), instagram: ['any', 'instagram'].includes(choice), site: ['any', 'site'].includes(choice) };
}
const needsEmailSearch = (choice) => choice === 'email' || choice === 'both';
// One contact is a sales channel (the site has none); several, or all, leave it empty.
const salesChannelFor = (choice) => (choice === 'whatsapp' ? 'whatsapp' : choice === 'email' ? 'email' : choice === 'instagram' ? 'instagram' : null);
function mapsCoordinate(value, label, limit) {
	const text = String(value ?? '').trim().replace(',', '.');
	const number = Number(text);
	if (text === '' || !Number.isFinite(number) || Math.abs(number) > limit) throw new Error(`${label} inválida: informe um número entre -${limit} e ${limit}.`);
	return text;
}
function parseFilename(headers, fallback) {
	const disposition = headers?.['content-disposition'] || headers?.['Content-Disposition'] || '';
	const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
	if (encoded) { try { return decodeURIComponent(encoded); } catch { /* fallback */ } }
	const plain = disposition.match(/filename="?([^";]+)"?/i)?.[1];
	return plain || fallback;
}

const salesChannels = [{ name: 'E-mail', value: 'email' }, { name: 'WhatsApp', value: 'whatsapp' }, { name: 'Instagram', value: 'instagram' }, { name: 'Google Ads', value: 'google_ads' }, { name: 'Ligação', value: 'phone' }, { name: 'Presencial', value: 'in_person' }, { name: 'Outro', value: 'other' }];

const resourceOptions = [
	{ name: 'Clientes', value: 'clients' }, { name: 'Automações', value: 'automations' },
	{ name: 'Documentos', value: 'documents' }, { name: 'Notificações', value: 'notifications' },
	{ name: 'Dashboard', value: 'dashboard' }, { name: 'Avisos administrativos', value: 'announcements' },
	{ name: 'Maps', value: 'maps' },
];
const operationOptions = {
	clients: [{ name: 'Get Many', value: 'getMany' }, { name: 'Get', value: 'get' }, { name: 'Buscar por ID ou nome', value: 'search' }, { name: 'Criar', value: 'create' }, { name: 'Atualizar', value: 'update' }, { name: 'Excluir', value: 'delete' }],
	automations: [{ name: 'Get Many', value: 'getMany' }, { name: 'Get', value: 'get' }, { name: 'Salvar arquivo', value: 'create' }, { name: 'Baixar arquivo', value: 'download' }, { name: 'Baixar imagem', value: 'image' }],
	documents: [{ name: 'Get Many', value: 'getMany' }, { name: 'Get', value: 'get' }, { name: 'Enviar arquivo', value: 'upload' }, { name: 'Baixar arquivo', value: 'download' }, { name: 'Excluir', value: 'delete' }],
	notifications: [{ name: 'Get Many', value: 'getMany' }, { name: 'Get', value: 'get' }, { name: 'Contar não lidas', value: 'unreadCount' }, { name: 'Marcar como lida', value: 'markRead' }, { name: 'Marcar conversa como lida', value: 'markChatRead' }],
	dashboard: [{ name: 'Obter resumo', value: 'get' }], announcements: [{ name: 'Criar aviso', value: 'create' }],
	maps: [{ name: 'Criar busca', value: 'create' }, { name: 'Get Many', value: 'getMany' }, { name: 'Get', value: 'get' }, { name: 'Baixar resultados', value: 'results' }, { name: 'Excluir busca', value: 'delete' }],
};
const toolOperationDescriptions = {
	clients: { getMany: 'Listar clientes, com filtros opcionais.', get: 'Consultar um cliente pelo ID.', search: 'Localizar cliente pelo ID ou nome.', create: 'Cadastrar um cliente na Nexo.', update: 'Atualizar um cliente localizando-o por ID, nome ou telefone.', delete: 'Excluir um cliente da Nexo.' },
	automations: { getMany: 'Listar automações salvas na biblioteca.', get: 'Consultar os dados de uma automação.', create: 'Salvar uma automação na biblioteca.', download: 'Baixar o arquivo de uma automação.', image: 'Baixar a imagem de uma automação.' },
	documents: { getMany: 'Listar documentos, opcionalmente filtrados por cliente.', get: 'Consultar um documento pelo ID.', upload: 'Enviar um documento para a Nexo.', download: 'Baixar um documento.', delete: 'Excluir um documento.' },
	notifications: { getMany: 'Listar notificações da conta.', get: 'Consultar uma notificação pelo ID.', unreadCount: 'Consultar a contagem de notificações não lidas.', markRead: 'Marcar uma notificação como lida.', markChatRead: 'Marcar as mensagens de um membro como lidas.' },
	dashboard: { get: 'Consultar o resumo do dashboard da Nexo.' }, announcements: { create: 'Publicar um aviso para os membros aprovados.' },
	maps: { create: 'Criar uma busca de empresas no Google Maps por nicho (cidade padrão São Paulo; cidade, latitude e longitude em Opções) e escolher o contato que você quer: WhatsApp, e-mail ou os dois.', getMany: 'Listar as buscas do Maps.', get: 'Consultar o status de uma busca do Maps (working, ok ou failed).', results: 'Baixar as empresas encontradas por uma busca concluída, uma por item, filtrando pelo contato escolhido.', delete: 'Apagar uma busca do Maps e seus resultados.' },
};

const fields = [];
function addField(displayName, name, type, defaults, extra = {}) { fields.push({ displayName, name, type, default: defaults, ...extra }); }
addField('Recurso', 'resource', 'options', 'clients', { options: resourceOptions, noDataExpression: true });
addField('Operação', 'operation', 'options', 'getMany', { options: [{ name: 'Selecione uma operação', value: '__select' }], noDataExpression: true, displayOptions: { show: { resource: Object.keys(operationOptions) } }, typeOptions: { loadOptionsMethod: 'getOperations', loadOptionsDependsOn: ['resource'] } });
function add(displayName, name, type, defaultValue, resource, operations, extra = {}) { addField(displayName, name, type, defaultValue, { displayOptions: { show: { resource: [resource], operation: operations } }, ...extra }); }

add('ID do cliente', 'identifier', 'string', '', 'clients', ['get'], { required: true });
add('Excluir cliente por', 'deleteLookupBy', 'options', 'id', 'clients', ['delete'], { required: true, options: [{ name: 'ID', value: 'id' }, { name: 'Nome', value: 'name' }] });
add('ID ou nome do cliente', 'deleteLookupValue', 'string', '', 'clients', ['delete'], { required: true, description: 'Valor usado para localizar o cliente antes da exclusão.' });
add('Buscar cliente por', 'updateLookupBy', 'options', 'id', 'clients', ['update'], { required: true, options: [{ name: 'ID', value: 'id' }, { name: 'Nome', value: 'name' }, { name: 'Número de telefone', value: 'phone' }] });
add('ID, nome ou número do cliente', 'updateLookupValue', 'string', '', 'clients', ['update'], { required: true, description: 'Valor usado para localizar o cliente antes da atualização.' });
add('Nome', 'name', 'string', '', 'clients', ['create', 'update']);
add('Nicho', 'niche', 'options', '', 'clients', ['create', 'update'], { options: [{ name: 'Selecione um nicho', value: '' }, { name: 'Contabilidade', value: 'Contabilidade' }, { name: 'Saúde', value: 'Saúde' }, { name: 'Beleza e estética', value: 'Beleza e estética' }, { name: 'Imobiliário', value: 'Imobiliário' }, { name: 'Advocacia', value: 'Advocacia' }, { name: 'Educação', value: 'Educação' }, { name: 'Varejo', value: 'Varejo' }, { name: 'Comércio', value: 'Comércio' }, { name: 'Alimentação', value: 'Alimentação' }, { name: 'Tecnologia', value: 'Tecnologia' }, { name: 'Construção civil', value: 'Construção civil' }, { name: 'Indústria', value: 'Indústria' }, { name: 'Logística', value: 'Logística' }, { name: 'Serviços profissionais', value: 'Serviços profissionais' }, { name: 'Marketing e publicidade', value: 'Marketing e publicidade' }, { name: 'Automotivo', value: 'Automotivo' }, { name: 'Outro', value: 'Outro' }] });
add('Telefone', 'phone', 'string', '', 'clients', ['create', 'update']); add('E-mail', 'email', 'string', '', 'clients', ['create', 'update']); add('Endereço', 'address', 'string', '', 'clients', ['create', 'update'], { description: 'Endereço do cliente; o painel mostra um botão para abrir no Google Maps.' });
add('Etapa do funil', 'pipelineStage', 'options', '', 'clients', ['getMany', 'create', 'update'], { options: [{ name: 'Não alterar / sem filtro', value: '' }, { name: 'Lead', value: 'lead' }, { name: 'Contato feito', value: 'contacted' }, { name: 'Qualificado (tráfego pago)', value: 'qualified' }, { name: 'Reunião marcada (tráfego pago)', value: 'meeting' }, { name: 'Proposta', value: 'proposal' }, { name: 'Diagnóstico', value: 'diagnosis' }, { name: 'Negociação', value: 'negotiation' }, { name: 'Ganho', value: 'won' }, { name: 'Perdido', value: 'lost' }] });
add('Canal de vendas', 'salesChannel', 'options', '', 'clients', ['create'], { options: [{ name: 'Sem canal', value: '' }, ...salesChannels], description: 'Por onde o cliente é abordado. Opcional.' });
add('Canal de vendas', 'salesChannel', 'options', '', 'clients', ['update'], { options: [{ name: 'Não alterar', value: '' }, ...salesChannels, { name: 'Remover canal', value: '__clear' }], description: 'Escolha "Remover canal" para deixar o cliente sem canal de vendas.' });
add('Contrato fechado', 'contractClosed', 'options', 'unchanged', 'clients', ['create', 'update'], { options: [{ name: 'Não alterar (ou não fechado ao criar)', value: 'unchanged' }, { name: 'Sim', value: 'true' }, { name: 'Não', value: 'false' }] });
add('Valor do contrato', 'contractValue', 'number', null, 'clients', ['create', 'update']); add('Observações', 'notes', 'string', '', 'clients', ['create', 'update'], { typeOptions: { rows: 3 } }); add('Próximo acompanhamento', 'nextFollowUp', 'dateTime', '', 'clients', ['create', 'update']); add('Dor identificada', 'pain', 'string', '', 'clients', ['create', 'update'], { typeOptions: { rows: 3 } }); add('Abordagem', 'approach', 'string', '', 'clients', ['create', 'update'], { typeOptions: { rows: 3 } }); add('Instagram', 'instagram', 'string', '', 'clients', ['create', 'update']); add('Site', 'website', 'string', '', 'clients', ['create', 'update']);
add('Filtrar por nicho', 'filterNiche', 'options', '', 'clients', ['getMany'], { options: [{ name: 'Todos os nichos', value: '' }, { name: 'Contabilidade', value: 'Contabilidade' }, { name: 'Saúde', value: 'Saúde' }, { name: 'Beleza e estética', value: 'Beleza e estética' }, { name: 'Imobiliário', value: 'Imobiliário' }, { name: 'Advocacia', value: 'Advocacia' }, { name: 'Educação', value: 'Educação' }, { name: 'Varejo', value: 'Varejo' }, { name: 'Comércio', value: 'Comércio' }, { name: 'Alimentação', value: 'Alimentação' }, { name: 'Tecnologia', value: 'Tecnologia' }, { name: 'Construção civil', value: 'Construção civil' }, { name: 'Indústria', value: 'Indústria' }, { name: 'Logística', value: 'Logística' }, { name: 'Serviços profissionais', value: 'Serviços profissionais' }, { name: 'Marketing e publicidade', value: 'Marketing e publicidade' }, { name: 'Automotivo', value: 'Automotivo' }, { name: 'Outro', value: 'Outro' }] });
add('Filtrar por canal de vendas', 'filterSalesChannel', 'options', '', 'clients', ['getMany'], { options: [{ name: 'Todos os canais', value: '' }, ...salesChannels] });
add('Filtrar por nome', 'filterName', 'string', '', 'clients', ['getMany']); add('ID ou nome para busca', 'searchTerm', 'string', '', 'clients', ['search'], { required: true }); add('Buscar como', 'searchBy', 'options', 'auto', 'clients', ['search'], { options: [{ name: 'Detectar automaticamente', value: 'auto' }, { name: 'ID', value: 'id' }, { name: 'Nome', value: 'name' }] }); add('ID do criador', 'createdById', 'string', '', 'clients', ['getMany']); add('Filtrar por contrato fechado', 'filterContractClosed', 'options', 'all', 'clients', ['getMany'], { options: [{ name: 'Todos', value: 'all' }, { name: 'Sim', value: 'true' }, { name: 'Não', value: 'false' }] });
for (const resource of ['clients', 'automations', 'documents', 'notifications']) { add('Limite', 'limit', 'number', 50, resource, ['getMany'], { typeOptions: { minValue: 1, maxValue: 100 } }); add('Deslocamento', 'offset', 'number', 0, resource, ['getMany'], { typeOptions: { minValue: 0 } }); }
add('ID da automação', 'identifier', 'string', '', 'automations', ['get', 'download', 'image'], { required: true }); add('Nome', 'automationName', 'string', '', 'automations', ['create'], { required: true }); add('Descrição', 'automationDescription', 'string', '', 'automations', ['create'], { required: true, typeOptions: { rows: 3 } }); add('Propriedade binária do arquivo', 'fileBinaryProperty', 'string', 'data', 'automations', ['create'], { required: true }); add('Propriedade binária da imagem', 'imageBinaryProperty', 'string', '', 'automations', ['create']);
add('ID do cliente', 'documentClientId', 'string', '', 'documents', ['getMany', 'upload']); add('Propriedade binária do arquivo', 'fileBinaryProperty', 'string', 'data', 'documents', ['upload'], { required: true }); add('ID do documento', 'identifier', 'string', '', 'documents', ['get', 'download', 'delete'], { required: true });
add('Tipo', 'notificationKind', 'options', 'all', 'notifications', ['getMany'], { options: [{ name: 'Todas', value: 'all' }, { name: 'Avisos', value: 'announcement' }, { name: 'Novos membros', value: 'member_joined' }, { name: 'Mensagens do chat', value: 'chat_message' }, { name: 'Solicitações de automação', value: 'automation_request' }, { name: 'Convites de automação', value: 'automation_invitation' }, { name: 'Solicitações rejeitadas', value: 'automation_rejected' }] }); add('ID da notificação', 'identifier', 'string', '', 'notifications', ['get', 'markRead'], { required: true }); add('ID do membro do chat', 'memberId', 'string', '', 'notifications', ['markChatRead'], { required: true }); add('Título', 'title', 'string', '', 'announcements', ['create'], { required: true }); add('Conteúdo', 'body', 'string', '', 'announcements', ['create'], { required: true, typeOptions: { rows: 4 } }); add('Público', 'audience', 'options', 'all', 'announcements', ['create'], { options: [{ name: 'Todos', value: 'all' }, { name: 'Comercial', value: 'commercial' }, { name: 'Desenvolvimento', value: 'dev' }], description: 'Quem recebe o aviso. Administradores e owners sempre recebem.' });
add('Nome da busca (opcional)', 'mapsName', 'string', '', 'maps', ['create'], { description: 'Se ficar vazio, usa o nicho e a cidade.' });
add('Nicho', 'mapsNiche', 'options', 'Contabilidade', 'maps', ['create'], { required: true, options: Object.keys(MAPS_NICHES).map((niche) => ({ name: niche, value: niche, description: `Busca por: ${MAPS_NICHES[niche].join(', ')}.` })), description: 'A busca usa os termos certos de cada nicho.' });
add('Contato que você quer nos leads', 'mapsContact', 'options', 'any', 'maps', ['create'], { options: CONTACT_CHOICES, description: 'E-mail e "WhatsApp e e-mail" ligam a busca de e-mails nos sites das empresas.' });
add('Opções', 'mapsOptions', 'collection', {}, 'maps', ['create'], {
	placeholder: 'Adicionar opção', description: `Sem opções, a busca é em ${MAPS_DEFAULT_CITY.name} (latitude ${MAPS_DEFAULT_CITY.lat}, longitude ${MAPS_DEFAULT_CITY.lon}), raio de ${MAPS_DEFAULT_RADIUS} m.`,
	options: [
		{ displayName: 'Cidade', name: 'mapsCity', type: 'options', default: MAPS_DEFAULT_CITY.name, options: MAPS_CITIES.map((city) => ({ name: city.name, value: city.name })), description: 'Centro da busca. Latitude e longitude, se informadas, valem mais que a cidade.' },
		{ displayName: 'Latitude', name: 'mapsLat', type: 'string', default: MAPS_DEFAULT_CITY.lat, description: 'Centro da busca, ex.: -23.5505.' },
		{ displayName: 'Longitude', name: 'mapsLon', type: 'string', default: MAPS_DEFAULT_CITY.lon, description: 'Centro da busca, ex.: -46.6333.' },
		{ displayName: 'Raio (metros)', name: 'mapsRadius', type: 'number', default: MAPS_DEFAULT_RADIUS, typeOptions: { minValue: 100, maxValue: 50000 } },
		{ displayName: 'Zoom', name: 'mapsZoom', type: 'number', default: 15, typeOptions: { minValue: 1, maxValue: 21 } },
		{ displayName: 'Profundidade', name: 'mapsDepth', type: 'number', default: 3, typeOptions: { minValue: 1, maxValue: 20 }, description: 'Quanto maior, mais empresas e mais demora.' },
		{ displayName: 'Idioma', name: 'mapsLang', type: 'string', default: 'pt' },
		{ displayName: 'Buscar e-mails nos sites', name: 'mapsEmail', type: 'boolean', default: false, description: 'Já fica ligado quando o contato escolhido inclui e-mail.' },
		{ displayName: 'Modo rápido', name: 'mapsFastMode', type: 'boolean', default: false },
		{ displayName: 'Tempo máximo (segundos)', name: 'mapsMaxTime', type: 'number', default: 300, typeOptions: { minValue: 60, maxValue: 1800 } },
	],
});
add('Ampliar o raio se não achar nada', 'mapsExpand', 'boolean', true, 'maps', ['results'], { description: 'Só vale para buscas no local padrão (uma das cidades da lista). Se a busca não achou nenhuma empresa, cria uma busca nova com o dobro do raio (até 50 km) e devolve o ID dela em new_job_id. Aguarde ela terminar e baixe os resultados da nova busca. Buscas com latitude e longitude informadas ficam só naquele perímetro.' });
add('Contato que você quer nos leads', 'mapsResultsContact', 'options', 'any', 'maps', ['results'], { options: CONTACT_CHOICES, description: 'Devolve só as empresas que têm esse contato, e cada item traz só esse contato (Todos os contatos traz tudo). WhatsApp conta só celular; Instagram e Site saem do site cadastrado no Maps (link do Instagram conta como Instagram; Facebook e links de redes sociais não contam como site). Cada item traz o canal de vendas sugerido (sales_channel).' });
add('Limite de empresas', 'mapsResultsLimit', 'number', 0, 'maps', ['results'], { typeOptions: { minValue: 0 }, description: 'Devolve no máximo essa quantidade de empresas (já com o contato escolhido). 0 devolve todas.' });
add('ID da busca', 'identifier', 'string', '', 'maps', ['get', 'results', 'delete'], { required: true });

class Nexo {
	constructor() { this.description = { displayName: 'Nexo', name: 'nexo', icon: 'file:nexo-mark.svg', group: ['transform'], version: 1, subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}', description: 'Node de ações da Nexo. Conecte à porta Tool do AI Agent e configure o recurso e a operação que o agente deve executar.', defaults: { name: 'Nexo', color: '#6D4AFF' }, usableAsTool: true, inputs: ['main'], outputs: ['main'], credentials: [{ name: 'nexoApi', required: true }], properties: fields }; }
	methods = { loadOptions: { getOperations() { const resource = this.getCurrentNodeParameter('resource'); return (operationOptions[resource] || []).map((operation) => ({ ...operation, action: operation.name, description: toolOperationDescriptions[resource]?.[operation.value] || operation.name })); } } };
	async execute() {
		const items = this.getInputData(); const returnData = []; const resource = this.getNodeParameter('resource', 0); const operation = this.getNodeParameter('operation', 0); const credentials = await this.getCredentials('nexoApi'); const baseUrl = String(credentials.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
		for (let i = 0; i < items.length; i++) {
			let method = 'GET', path = '', qs = {}, body, headers = {}, binaryResult = false, csvResult = false, fallbackFilename = 'nexo-file', requestBase = baseUrl;
			if (resource === 'dashboard') path = '/dashboard';
			else if (resource === 'clients') {
				const identifier = this.getNodeParameter('identifier', i, '');
				if (operation === 'getMany') {
					path = '/clients'; qs = { limit: this.getNodeParameter('limit', i, 50), offset: this.getNodeParameter('offset', i, 0) };
					const queryFields = { niche: this.getNodeParameter('filterNiche', i, ''), name: this.getNodeParameter('filterName', i, ''), created_by_id: this.getNodeParameter('createdById', i, ''), sales_channel: this.getNodeParameter('filterSalesChannel', i, '') }; for (const [key, value] of Object.entries(queryFields)) if (value) qs[key] = value;
					const contractClosed = this.getNodeParameter('filterContractClosed', i, 'all'); if (contractClosed !== 'all') qs.contract_closed = contractClosed; const stage = this.getNodeParameter('pipelineStage', i, ''); if (stage) qs.pipeline_stage = stage;
				} else if (operation === 'search') {
					const searchTerm = String(this.getNodeParameter('searchTerm', i, '')).trim(); if (!searchTerm) throw new Error('Informe o ID ou o nome do cliente para buscar.'); const searchBy = this.getNodeParameter('searchBy', i, 'auto'); const looksLikeId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(searchTerm); if (searchBy === 'id' || (searchBy === 'auto' && looksLikeId)) path = `/clients/${encodedPath(searchTerm)}`; else { path = '/clients'; qs = { name: searchTerm, limit: 100, offset: 0 }; }
				} else if (operation === 'get') path = `/clients/${encodedPath(identifier)}`;
				else if (operation === 'create' || operation === 'update') {
					method = operation === 'create' ? 'POST' : 'PATCH';
					if (operation === 'create') path = '/clients';
					else {
						const lookupBy = this.getNodeParameter('updateLookupBy', i, 'id'); const lookupValue = String(this.getNodeParameter('updateLookupValue', i, '')).trim(); if (!lookupValue) throw new Error('Informe o ID, nome ou número do cliente para atualizar.'); let targetId = lookupValue;
						if (lookupBy !== 'id') {
							const lookupResponse = await this.helpers.httpRequestWithAuthentication.call(this, 'nexoApi', { method: 'GET', baseURL: `${baseUrl}/`, url: 'clients', qs: lookupBy === 'name' ? { name: lookupValue, limit: 100, offset: 0 } : { limit: 100, offset: 0 }, json: true, timeout: 30000 });
							const clients = Array.isArray(lookupResponse) ? lookupResponse : (lookupResponse?.items || lookupResponse?.clients || []); const matches = lookupBy === 'name' ? clients.filter((client) => String(client.name || '').trim().toLocaleLowerCase() === lookupValue.toLocaleLowerCase()) : clients.filter((client) => normalizePhone(client.phone) === normalizePhone(lookupValue));
							if (matches.length === 0) throw new Error(`Nenhum cliente encontrado pelo ${lookupBy === 'name' ? 'nome' : 'número'} informado.`); if (matches.length > 1) throw new Error(`Mais de um cliente corresponde ao ${lookupBy === 'name' ? 'nome' : 'número'} informado. Use o ID para evitar atualizar o cliente errado.`); targetId = matches[0].id || matches[0].public_id; if (!targetId) throw new Error('O cliente encontrado não possui um ID válido para atualização.');
						}
						path = `/clients/${encodedPath(targetId)}`;
					}
					body = {}; for (const [field, apiField] of [['name','name'],['niche','niche'],['phone','phone'],['email','email'],['address','address'],['pipelineStage','pipeline_stage'],['contractValue','contract_value'],['notes','notes'],['nextFollowUp','next_follow_up'],['pain','pain'],['approach','approach'],['instagram','instagram'],['website','website']]) { const value = this.getNodeParameter(field, i, undefined); if (value === undefined || value === null || value === '') continue; if (field === 'contractValue') { const numericValue = Number(value); if (!Number.isFinite(numericValue)) continue; body[apiField] = numericValue; } else body[apiField] = value; }
					const salesChannel = this.getNodeParameter('salesChannel', i, ''); if (salesChannel === '__clear') body.sales_channel = null; else if (salesChannel) body.sales_channel = salesChannel;
					const contractClosed = this.getNodeParameter('contractClosed', i, 'unchanged'); if (contractClosed !== 'unchanged') body.contract_closed = contractClosed === 'true'; else if (operation === 'create') body.contract_closed = false; if (operation === 'create' && !body.pipeline_stage) body.pipeline_stage = 'lead'; if (operation === 'create' && (!body.name || !body.niche)) throw new Error('Para criar um cliente, preencha Nome e Nicho.');
				} else {
					method = 'DELETE';
					const lookupBy = this.getNodeParameter('deleteLookupBy', i, 'id');
					const lookupValue = String(this.getNodeParameter('deleteLookupValue', i, identifier)).trim();
					if (!lookupValue) throw new Error('Informe o ID ou nome do cliente para excluir.');
					let targetId = lookupValue;
					if (lookupBy === 'name') {
						const lookupResponse = await this.helpers.httpRequestWithAuthentication.call(this, 'nexoApi', { method: 'GET', baseURL: `${baseUrl}/`, url: 'clients', qs: { name: lookupValue, limit: 100, offset: 0 }, json: true, timeout: 30000 });
						const clients = Array.isArray(lookupResponse) ? lookupResponse : (lookupResponse?.items || lookupResponse?.clients || []);
						const matches = clients.filter((client) => String(client.name || '').trim().toLocaleLowerCase() === lookupValue.toLocaleLowerCase());
						if (matches.length === 0) throw new Error('Nenhum cliente encontrado pelo nome informado.');
						if (matches.length > 1) throw new Error('Mais de um cliente corresponde ao nome informado. Use o ID para evitar excluir o cliente errado.');
						targetId = matches[0].id || matches[0].public_id;
						if (!targetId) throw new Error('O cliente encontrado não possui um ID válido para exclusão.');
					}
					path = `/clients/${encodedPath(targetId)}`;
				}
			} else if (resource === 'automations') {
				if (operation === 'getMany') { path = '/automations'; qs = { limit: this.getNodeParameter('limit', i, 50), offset: this.getNodeParameter('offset', i, 0) }; }
				else if (operation === 'get') path = `/automations/${encodedPath(this.getNodeParameter('identifier', i))}`;
				else if (operation === 'create') { method = 'POST'; path = '/automations'; const fileField = this.getNodeParameter('fileBinaryProperty', i, 'data'); const fileInfo = items[i].binary?.[fileField]; if (!fileInfo) throw new Error(`Arquivo binário "${fileField}" não encontrado no item ${i + 1}.`); const fileData = await this.helpers.getBinaryDataBuffer(i, fileField); const files = [{ field: 'file', fileName: fileInfo.fileName || 'automation.json', mimeType: fileInfo.mimeType || 'application/octet-stream', data: fileData }]; const imageField = this.getNodeParameter('imageBinaryProperty', i, ''); if (imageField && items[i].binary?.[imageField]) { const imageInfo = items[i].binary[imageField]; files.push({ field: 'image', fileName: imageInfo.fileName || 'image.jpg', mimeType: imageInfo.mimeType || 'image/jpeg', data: await this.helpers.getBinaryDataBuffer(i, imageField) }); } const form = multipart({ name: this.getNodeParameter('automationName', i), description: this.getNodeParameter('automationDescription', i) }, files); body = form.body; headers['Content-Type'] = form.contentType; }
				else { const identifier = encodedPath(this.getNodeParameter('identifier', i)); path = operation === 'download' ? `/automations/${identifier}/download` : `/automations/${identifier}/image`; binaryResult = true; fallbackFilename = operation === 'image' ? 'automation-image.jpg' : 'automation.json'; }
			} else if (resource === 'documents') {
				if (operation === 'getMany') { path = '/documents'; qs = { limit: this.getNodeParameter('limit', i, 50), offset: this.getNodeParameter('offset', i, 0) }; const clientId = this.getNodeParameter('documentClientId', i, ''); if (clientId) qs.client_id = clientId; }
				else if (operation === 'upload') { method = 'POST'; path = '/documents'; const fileField = this.getNodeParameter('fileBinaryProperty', i, 'data'); const fileInfo = items[i].binary?.[fileField]; if (!fileInfo) throw new Error(`Arquivo binário "${fileField}" não encontrado no item ${i + 1}.`); const form = multipart({}, [{ field: 'file', fileName: fileInfo.fileName || 'document', mimeType: fileInfo.mimeType || 'application/octet-stream', data: await this.helpers.getBinaryDataBuffer(i, fileField) }]); body = form.body; headers['Content-Type'] = form.contentType; const clientId = this.getNodeParameter('documentClientId', i, ''); if (clientId) qs.client_id = clientId; }
				else if (operation === 'get') path = `/documents/${encodedPath(this.getNodeParameter('identifier', i))}`; else if (operation === 'download') { path = `/documents/${encodedPath(this.getNodeParameter('identifier', i))}/download`; binaryResult = true; fallbackFilename = 'document'; } else { method = 'DELETE'; path = `/documents/${encodedPath(this.getNodeParameter('identifier', i))}`; }
			} else if (resource === 'notifications') {
				if (operation === 'getMany') { path = '/notifications'; qs = { limit: this.getNodeParameter('limit', i, 50), offset: this.getNodeParameter('offset', i, 0) }; const kind = this.getNodeParameter('notificationKind', i, 'all'); if (kind !== 'all') qs.kind = kind; } else if (operation === 'get') path = `/notifications/${encodedPath(this.getNodeParameter('identifier', i))}`; else if (operation === 'unreadCount') path = '/notifications/unread-count'; else if (operation === 'markRead') { method = 'PATCH'; path = `/notifications/${encodedPath(this.getNodeParameter('identifier', i))}/read`; } else { method = 'PATCH'; path = `/notifications/chat/${encodedPath(this.getNodeParameter('memberId', i))}/read`; }
			} else if (resource === 'announcements') { method = 'POST'; path = '/admin/announcements'; body = { title: this.getNodeParameter('title', i), body: this.getNodeParameter('body', i), audience: this.getNodeParameter('audience', i, 'all') }; }
			else if (resource === 'maps') {
				// The Maps server is a separate service that accepts the same Nexo API key.
				requestBase = String(credentials.mapsUrl || DEFAULT_MAPS_URL).replace(/\/+$/, '');
				if (operation === 'getMany') path = '/api/v1/jobs';
				else if (operation === 'create') {
					method = 'POST'; path = '/api/v1/jobs';
					const niche = String(this.getNodeParameter('mapsNiche', i, 'Contabilidade'));
					const keywords = MAPS_NICHES[niche]; if (!keywords) throw new Error('Nicho inválido: escolha um nicho da lista.');
					const contact = contactChoice(this.getNodeParameter('mapsContact', i, 'any'));
					const extra = this.getNodeParameter('mapsOptions', i, {}) || {};
					const city = extra.mapsCity === undefined ? undefined : MAPS_CITIES.find((candidate) => candidate.name === extra.mapsCity);
					if (extra.mapsCity !== undefined && !city) throw new Error('Cidade inválida: escolha uma cidade da lista ou informe latitude e longitude.');
					const bounded = (key, label, min, max, fallback) => { const value = Number(extra[key] ?? fallback); if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} deve estar entre ${min} e ${max}.`); return value; };
					const where = city || MAPS_DEFAULT_CITY;
					const customPlace = extra.mapsLat !== undefined || extra.mapsLon !== undefined;
					const placeName = customPlace && !city ? 'local personalizado' : where.name;
					body = { name: (String(this.getNodeParameter('mapsName', i, '') || '').trim() || `${niche} · ${placeName}`).slice(0, 80), keywords, lang: String(extra.mapsLang ?? 'pt').trim() || 'pt', lat: mapsCoordinate(extra.mapsLat ?? where.lat, 'Latitude', 90), lon: mapsCoordinate(extra.mapsLon ?? where.lon, 'Longitude', 180), zoom: bounded('mapsZoom', 'Zoom', 1, 21, 15), radius: bounded('mapsRadius', 'O raio', 100, 50000, MAPS_DEFAULT_RADIUS), depth: bounded('mapsDepth', 'A profundidade', 1, 20, 3), email: Boolean(extra.mapsEmail) || needsEmailSearch(contact), fast_mode: Boolean(extra.mapsFastMode), max_time: bounded('mapsMaxTime', 'O tempo máximo', 60, 1800, 300) };
				} else {
					const jobId = String(this.getNodeParameter('identifier', i, '')).trim(); if (!jobId) throw new Error('Informe o ID da busca.');
					path = `/api/v1/jobs/${encodedPath(jobId)}`;
					if (operation === 'results') { path += '/download'; csvResult = true; headers.Accept = 'text/csv'; } else if (operation === 'delete') method = 'DELETE';
				}
			}
			const response = await this.helpers.httpRequestWithAuthentication.call(this, 'nexoApi', { method, baseURL: `${requestBase}/`, url: path.replace(/^\//, ''), qs, body, headers, json: !binaryResult && !csvResult, returnFullResponse: binaryResult, encoding: binaryResult ? 'arraybuffer' : csvResult ? 'text' : 'json', timeout: 30000 });
			if (csvResult) {
				const contact = contactChoice(this.getNodeParameter('mapsResultsContact', i, 'any'));
				const leads = parseCsv(Buffer.isBuffer(response) ? response.toString('utf8') : typeof response === 'string' ? response : String(response?.body ?? ''));
				const limit = Math.floor(Number(this.getNodeParameter('mapsResultsLimit', i, 0))) || 0;
				const matching = leads.filter((lead) => matchesContact({ phone: lead.phone, emails: lead.emails ?? lead.email, website: lead.website }, contact));
				const kept = limit > 0 ? matching.slice(0, limit) : matching;
				const parts = contactParts(contact);
				for (const lead of kept) {
					// Only the contact that was chosen is shown, so an e-mail search does not come back full of sites and phones.
					const json = { ...lead };
					if (parts.phone) { json.phone_e164 = phoneE164(lead.phone); json.is_mobile = isMobilePhone(lead.phone); } else delete json.phone;
					if (parts.email) json.has_email = hasEmail(lead.emails ?? lead.email); else { delete json.emails; delete json.email; }
					if (parts.instagram) json.instagram = instagramUrl(lead.website);
					if (parts.site) json.site = siteUrl(lead.website);
					if (!parts.instagram && !parts.site) delete json.website;
					json.sales_channel = salesChannelFor(contact);
					returnData.push({ json, pairedItem: { item: i } });
				}
				if (kept.length > 0) continue;
				// Nothing to return: say so (an empty output would stop the workflow) and, when allowed, widen the search.
				const jobId = String(this.getNodeParameter('identifier', i, '')).trim();
				const summary = { found: 0, job_id: jobId, total_in_search: leads.length, contact };
				const found = leads.length > 0 ? `A busca achou ${leads.length} empresa(s), mas nenhuma tem o contato escolhido.` : 'Nenhuma empresa encontrada.';
				if (leads.length > 0 && !this.getNodeParameter('mapsExpand', i, true)) { returnData.push({ json: { ...summary, expanded: false, reason: 'no_contact', message: found }, pairedItem: { item: i } }); continue; }
				const job = await this.helpers.httpRequestWithAuthentication.call(this, 'nexoApi', { method: 'GET', baseURL: `${requestBase}/`, url: `api/v1/jobs/${encodedPath(jobId)}`, json: true, timeout: 30000 });
				const data = job?.Data ?? job?.data ?? {};
				const radius = Number(data.radius);
				let reason = null;
				if (!this.getNodeParameter('mapsExpand', i, true)) reason = 'disabled';
				else if (!isDefaultPlace(data.lat, data.lon)) reason = 'custom_place';
				else if (!Number.isFinite(radius) || radius >= MAPS_MAX_RADIUS) reason = 'max_radius';
				if (reason) {
					const why = { disabled: 'A ampliação do raio está desligada.', custom_place: 'A busca foi só no perímetro informado, sem ampliar.', max_radius: `Nem ampliando o raio até ${kmLabel(MAPS_MAX_RADIUS)}.` }[reason];
					returnData.push({ json: { ...summary, expanded: false, reason, radius: Number.isFinite(radius) ? radius : null, message: `${found} ${why}` }, pairedItem: { item: i } });
					continue;
				}
				const bigger = Math.min(radius * 2, MAPS_MAX_RADIUS);
				const baseName = String(job?.Name ?? job?.name ?? 'Busca Nexo').replace(/ · [\d.,]+ km$/, '');
				const maxTime = Number(data.max_time); const seconds = maxTime >= 1e9 ? maxTime / 1e9 : maxTime;
				const created = await this.helpers.httpRequestWithAuthentication.call(this, 'nexoApi', { method: 'POST', baseURL: `${requestBase}/`, url: 'api/v1/jobs', json: true, timeout: 30000, headers: {}, body: { name: `${baseName} · ${kmLabel(bigger)}`.slice(0, 80), keywords: data.keywords, lang: data.lang || 'pt', lat: String(data.lat), lon: String(data.lon), zoom: Number(data.zoom) || 15, radius: bigger, depth: Number(data.depth) || 3, email: Boolean(data.email), fast_mode: Boolean(data.fast_mode), max_time: Number.isFinite(seconds) && seconds >= 60 ? seconds : 300 } });
				returnData.push({ json: { ...summary, expanded: true, previous_radius: radius, new_radius: bigger, new_job_id: created?.id ?? null, message: `Nenhuma empresa em ${kmLabel(radius)}. Criamos uma busca nova com ${kmLabel(bigger)}: aguarde ela terminar e baixe os resultados do new_job_id.` }, pairedItem: { item: i } });
				continue;
			}
			if (resource === 'maps' && operation === 'delete') { returnData.push({ json: { id: String(this.getNodeParameter('identifier', i, '')).trim(), deleted: true }, pairedItem: { item: i } }); continue; }
			if (resource === 'maps' && operation === 'getMany' && (!response || (Array.isArray(response) && response.length === 0))) { returnData.push({ json: { found: 0, message: 'Nenhuma busca do Maps encontrada.' }, pairedItem: { item: i } }); continue; } // the server answers null when there are no searches
			if (binaryResult) { const payload = response?.body ?? response; const buffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload); const fileName = parseFilename(response?.headers, fallbackFilename); const binary = await this.helpers.prepareBinaryData(buffer, fileName, response?.headers?.['content-type']); returnData.push({ json: { fileName, mimeType: binary.mimeType }, binary: { data: binary }, pairedItem: { item: i } }); continue; }
			if (Array.isArray(response)) for (const row of response) returnData.push({ json: row, pairedItem: { item: i } }); else if (response === undefined || response === null) returnData.push({ json: {}, pairedItem: { item: i } }); else returnData.push({ json: response, pairedItem: { item: i } });
		}
		return [returnData];
	}
}
module.exports = { Nexo };
