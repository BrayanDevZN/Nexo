// Nexo Atendimentos (scheduling) for the Nexo node: businesses, services and appointments through the regular
// Nexo API key, which acts as the Atendimentos account with the same e-mail. Kept apart from Nexo.node.js, which holds the panel's resources.
const CREDENTIAL = 'nexoApi'; // the same Nexo API key as every other resource
const DEFAULT_BASE_URL = 'https://nexo-production-60a0.up.railway.app';
const MAX_ROWS = 2000;
const PAGE = 100;

const BOOKING_RESOURCES = ['bookingBusinesses', 'bookingServices', 'bookingAppointments'];
const isBookingResource = (resource) => BOOKING_RESOURCES.includes(resource);

const bookingResourceOptions = [
	{ name: 'Atendimentos: negócios', value: 'bookingBusinesses' },
	{ name: 'Atendimentos: serviços', value: 'bookingServices' },
	{ name: 'Atendimentos: agendamentos', value: 'bookingAppointments' },
];
const bookingOperationOptions = {
	bookingBusinesses: [{ name: 'Get Many', value: 'getMany' }, { name: 'Get', value: 'get' }, { name: 'Resumo da agenda', value: 'overview' }, { name: 'Listar equipe', value: 'members' }],
	bookingServices: [{ name: 'Get Many', value: 'getMany' }],
	bookingAppointments: [{ name: 'Get Many', value: 'getMany' }, { name: 'Get', value: 'get' }, { name: 'Criar', value: 'create' }, { name: 'Atualizar', value: 'update' }, { name: 'Excluir', value: 'delete' }],
};
const bookingToolDescriptions = {
	bookingBusinesses: {
		getMany: 'Listar os negócios do Atendimentos de que a conta faz parte, com o ID de cada um.',
		get: 'Consultar um negócio do Atendimentos (horário de funcionamento, fuso, contato).',
		overview: 'Resumo da agenda de um negócio: atendimentos de hoje, dos próximos 7 dias, futuros e concluídos, e os próximos marcados.',
		members: 'Listar a equipe de um negócio.',
	},
	bookingServices: { getMany: 'Listar os serviços de um negócio, com ID, duração e preço.' },
	bookingAppointments: {
		getMany: 'Buscar agendamentos de um negócio entre um Start e um End, como no Google Calendar (para um dia inteiro: Start = 00:00 do dia, End = 00:00 do dia seguinte). Sem Start e End, traz todos. Filtra por situação (scheduled, confirmed, done, cancelled, no_show).',
		get: 'Consultar um agendamento pelo ID.',
		create: 'Marcar um atendimento: informe o nome do cliente, o Start, o End e, se quiser, um ou mais serviços do negócio.',
		update: 'Alterar um agendamento: remarcar (Start/End), trocar o nome do cliente ou os serviços, ou mudar a situação (confirmar, concluir, cancelar, faltou).',
		delete: 'Apagar um agendamento.',
	},
};

const STATUS_OPTIONS = [{ name: 'Marcado', value: 'scheduled' }, { name: 'Confirmado', value: 'confirmed' }, { name: 'Concluído', value: 'done' }, { name: 'Cancelado', value: 'cancelled' }, { name: 'Não veio', value: 'no_show' }];

const bookingFields = [];
function add(displayName, name, type, defaultValue, resource, operations, extra = {}) {
	const show = { resource: [resource] };
	if (operations) show.operation = operations;
	const { displayOptions, ...rest } = extra;
	bookingFields.push({ displayName, name, type, default: defaultValue, displayOptions: { show: { ...show, ...(displayOptions?.show || {}) } }, ...rest });
}

const NEEDS_BUSINESS = { bookingBusinesses: ['get', 'overview', 'members'], bookingServices: ['getMany'], bookingAppointments: ['getMany', 'get', 'create', 'update', 'delete'] };
for (const [resource, operations] of Object.entries(NEEDS_BUSINESS)) {
	add('Negócio', 'bookingBusinessId', 'options', '', resource, operations, { required: true, noDataExpression: true, typeOptions: { loadOptionsMethod: 'getBookingBusinesses' }, description: 'Lista todos os negócios do Atendimentos: escolha qual agenda mexer. É sempre escolhido aqui, pela pessoa (a IA não define este campo).' });
}
// Services
add('Só serviços ativos', 'bookingActiveOnly', 'boolean', false, 'bookingServices', ['getMany'], { description: 'Esconde os serviços desativados.' });
// Appointments: search between a Start and an End, like Google Calendar's timeMin / timeMax.
const WINDOW = 'Formato ISO 8601, ex.: 2026-11-16T09:00:00-03:00. Sem fuso, vale o horário do negócio.';
add('Start', 'bookingStart', 'dateTime', '', 'bookingAppointments', ['getMany'], { description: `Início da janela, como no Google Calendar: traz os agendamentos que ainda não tinham terminado nesse instante (os que terminam exatamente nele ficam de fora). Vazio: sem limite inicial. ${WINDOW}` });
add('End', 'bookingEnd', 'dateTime', '', 'bookingAppointments', ['getMany'], { description: `Fim da janela: traz os agendamentos que começam antes desse instante (os que começam exatamente nele ficam de fora). Vazio: sem limite final. Para ver um dia inteiro, Start = 00:00 do dia e End = 00:00 do dia seguinte. ${WINDOW}` });
add('Situação', 'bookingStatusFilter', 'options', '', 'bookingAppointments', ['getMany'], { options: [{ name: 'Todas as situações', value: '' }, ...STATUS_OPTIONS], description: 'Só os agendamentos nessa situação: scheduled (marcado), confirmed, done (concluído), cancelled ou no_show (não veio). Vazio: todas.' });
add('Devolver todos', 'bookingReturnAll', 'boolean', false, 'bookingAppointments', ['getMany'], { description: `Busca todas as páginas (até ${MAX_ROWS} agendamentos).` });
add('Limite', 'bookingLimit', 'number', 50, 'bookingAppointments', ['getMany'], { displayOptions: { show: { bookingReturnAll: [false] } }, typeOptions: { minValue: 1, maxValue: 500 }, description: 'Quantos agendamentos devolver, no máximo (1 a 500).' });
// Appointments: identify, create, update
add('ID do agendamento', 'bookingAppointmentId', 'string', '', 'bookingAppointments', ['get', 'update', 'delete'], { required: true, description: 'ID do agendamento (campo id de Agendamentos > Get Many).' });
// Creating an appointment needs only the customer's name, a Start, an End and (optionally) the services of the business.
add('Nome do cliente', 'bookingCustomerName', 'string', '', 'bookingAppointments', ['create'], { required: true, description: 'Nome de quem vai ser atendido.' });
add('Nome do cliente', 'bookingCustomerName', 'string', '', 'bookingAppointments', ['update'], { description: 'Vazio: não altera.' });
add('Start', 'bookingStartsAt', 'dateTime', '', 'bookingAppointments', ['create'], { required: true, description: `Quando o atendimento começa. ${WINDOW}` });
add('Start', 'bookingStartsAt', 'dateTime', '', 'bookingAppointments', ['update'], { description: `Para remarcar. Vazio: não altera. ${WINDOW}` });
add('End', 'bookingEndsAt', 'dateTime', '', 'bookingAppointments', ['create'], { required: true, description: `Quando o atendimento termina (depois do Start). ${WINDOW}` });
add('End', 'bookingEndsAt', 'dateTime', '', 'bookingAppointments', ['update'], { description: `Vazio: não altera. ${WINDOW}` });
add('Serviços', 'bookingServicesChosen', 'multiOptions', [], 'bookingAppointments', ['create', 'update'], { typeOptions: { loadOptionsMethod: 'getBookingServices', loadOptionsDependsOn: ['bookingBusinessId'] }, description: 'Um ou mais serviços do negócio escolhido. Com mais de um, o agendamento recebe todos os nomes e a soma dos preços. Ao atualizar, vazio não altera. Com a IA (✨), informe os IDs dos serviços separados por vírgula (veja em Atendimentos: serviços > Get Many).' });
add('Situação', 'bookingStatus', 'options', '', 'bookingAppointments', ['update'], { options: [{ name: 'Não alterar', value: '' }, ...STATUS_OPTIONS], description: 'Nova situação: scheduled, confirmed, done, cancelled ou no_show. Vazio: não altera.' });

// Time ----------------------------------------------------------------------------------------------------

const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;
function offsetMs(utcMs, timeZone) {
	const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(utcMs)).map((part) => [part.type, part.value]));
	return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - Math.floor(utcMs / 1000) * 1000;
}
/** A date-time as an ISO instant. Text with an offset or Z is taken as given; text without one is the business's local time. */
function instant(value, timeZone, label) {
	const text = String(value ?? '').trim();
	if (!text) throw new Error(`Informe ${label}.`);
	if (HAS_OFFSET.test(text) || !timeZone) {
		const date = new Date(text);
		if (Number.isNaN(date.getTime())) throw new Error(`${label}: data e hora inválidas.`);
		return date.toISOString();
	}
	const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
	if (!match) throw new Error(`${label}: data e hora inválidas.`);
	const [, y, mo, d, h = '0', mi = '0', s = '0'] = match;
	const wall = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
	let utc = wall - offsetMs(wall, timeZone);
	utc = wall - offsetMs(utc, timeZone); // second pass across a daylight-saving change
	return new Date(utc).toISOString();
}
// Requests ------------------------------------------------------------------------------------------------

function clean(text) { const value = String(text ?? '').trim(); return value === '' ? undefined : value; }
function money(value) {
	const text = clean(value);
	if (text === undefined) return undefined;
	const noSymbol = text.replace(/^R\$\s*/i, '');
	const normalized = noSymbol.includes(',') ? noSymbol.replace(/\./g, '').replace(',', '.') : noSymbol; // 1.234,56 -> 1234.56
	if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new Error('Preço inválido: use um valor como 45,00.');
	return normalized;
}

/** The reason the Nexo API gave (its `detail`), wherever n8n kept it on the error. */
function apiDetail(error) {
	let body = error?.cause?.response?.body ?? error?.cause?.response?.data ?? error?.response?.body ?? error?.context?.data ?? error?.cause?.body;
	if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return undefined; } }
	return typeof body?.detail === 'string' ? body.detail : undefined;
}
/** n8n only says "Forbidden - perhaps check your credentials?"; say what is actually wrong and how to fix it. */
function explain(error) {
	if (error?.nexoExplained) return error;
	const detail = apiDetail(error);
	const status = Number(error?.httpCode || error?.cause?.response?.status || error?.cause?.statusCode || error?.statusCode || 0);
	let text;
	if (status === 403 && /cannot access this route/i.test(detail || '')) {
		text = 'Esta chave de API não tem permissão para o Atendimentos: use uma chave de dono, administrador ou dev da Nexo.';
	} else if (status === 403 && /needs an Atendimentos account/i.test(detail || '')) {
		text = 'Esta ação precisa de uma conta do Atendimentos (criar negócio, convites): faça pelo app do Atendimentos.';
	} else if (detail) text = detail;
	if (!text) return error;
	const explained = new Error(text);
	explained.nexoExplained = true;
	explained.cause = error;
	return explained;
}

const loadOptions = {
	/** The services of the chosen business, for "Serviços". */
	async getBookingServices() {
		const business = clean(this.getCurrentNodeParameter('bookingBusinessId', { extractValue: true }));
		if (!business) return [];
		const credentials = await this.getCredentials(CREDENTIAL);
		const baseUrl = String(credentials.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
		const rows = await this.helpers.httpRequestWithAuthentication.call(this, CREDENTIAL, { method: 'GET', baseURL: `${baseUrl}/`, url: `atendimentos/businesses/${encodeURIComponent(business)}/services`, qs: { active: true }, json: true, timeout: 30000 }).catch((error) => { throw explain(error); });
		return (Array.isArray(rows) ? rows : []).map((row) => ({ name: row.name, value: row.id, description: `${row.duration_minutes} min${row.price !== null && row.price !== undefined ? ` · R$ ${Number(row.price).toFixed(2).replace('.', ',')}` : ''}` }));
	},
	async getBookingBusinesses() {
		const credentials = await this.getCredentials(CREDENTIAL);
		const baseUrl = String(credentials.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
		const rows = await this.helpers.httpRequestWithAuthentication.call(this, CREDENTIAL, { method: 'GET', baseURL: `${baseUrl}/`, url: 'atendimentos/businesses', json: true, timeout: 30000 }).catch((error) => { throw explain(error); });
		return (Array.isArray(rows) ? rows : []).map((row) => ({ name: row.name, value: row.id, description: [row.city, row.state].filter(Boolean).join(' / ') || undefined }));
	},
};

/** Runs one input item of a booking operation and returns the JSON rows to emit. */
async function executeBooking(ctx, resource, operation, index, state) {
	const param = (name, fallback = '') => ctx.getNodeParameter(name, index, fallback);
	const call = (options) => ctx.helpers.httpRequestWithAuthentication.call(ctx, CREDENTIAL, { baseURL: `${state.baseUrl}/`, json: true, timeout: 30000, ...options }).catch((error) => { throw explain(error); });
	const businessId = () => {
		const id = clean(param('bookingBusinessId'));
		if (!id) throw new Error('Escolha o negócio.');
		return encodeURIComponent(id);
	};
	const zone = async () => {
		if (!state.zones.has(businessId())) {
			const business = await call({ method: 'GET', url: `atendimentos/businesses/${businessId()}` });
			state.zones.set(businessId(), business?.timezone || 'America/Sao_Paulo');
		}
		return state.zones.get(businessId());
	};
	// The business is only asked for its time zone when the text has no offset of its own.
	const when = async (value, label) => { const text = String(value ?? '').trim(); return instant(text, text && !HAS_OFFSET.test(text) ? await zone() : null, label); };
	const base = (suffix = '') => `atendimentos/businesses/${businessId()}${suffix}`;
	const rows = (value) => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);

	if (resource === 'bookingBusinesses') {
		if (operation === 'getMany') return rows(await call({ method: 'GET', url: 'atendimentos/businesses' }));
		if (operation === 'get') return rows(await call({ method: 'GET', url: base() }));
		if (operation === 'overview') return rows(await call({ method: 'GET', url: base('/overview') }));
		if (operation === 'members') return rows(await call({ method: 'GET', url: base('/members') }));
	}
	if (resource === 'bookingServices') {
		return rows(await call({ method: 'GET', url: base('/services'), qs: param('bookingActiveOnly', false) ? { active: true } : {} }));
	}
	if (resource !== 'bookingAppointments') throw new Error('Recurso de Atendimentos desconhecido.');

	if (operation === 'get') return rows(await call({ method: 'GET', url: base('/appointments/' + encodeURIComponent(String(param('bookingAppointmentId')).trim())) }));
	if (operation === 'delete') {
		const id = String(param('bookingAppointmentId')).trim();
		if (!id) throw new Error('Informe o ID do agendamento.');
		await call({ method: 'DELETE', url: base('/appointments/' + encodeURIComponent(id)) });
		return [{ id, deleted: true }];
	}
	if (operation === 'getMany') {
		const qs = {};
		// Google Calendar's window: an appointment is in it when it ends after Start and begins before End.
		const start = clean(param('bookingStart'));
		const end = clean(param('bookingEnd'));
		if (start) qs.ends_after = await when(start, 'o Start');
		if (end) qs.starts_until = await when(end, 'o End');
		if (qs.ends_after && qs.starts_until && qs.starts_until <= qs.ends_after) throw new Error('O End precisa ser depois do Start.');
		for (const [field, apiField] of [['bookingStatusFilter', 'status']]) {
			const value = clean(param(field));
			if (value) qs[apiField] = value;
		}
		const wanted = param('bookingReturnAll', false) ? MAX_ROWS : Math.min(Math.max(Number(param('bookingLimit', 50)) || 50, 1), 500);
		const all = [];
		while (all.length < wanted) {
			const size = Math.min(PAGE, wanted - all.length);
			const page = rows(await call({ method: 'GET', url: base('/appointments'), qs: { ...qs, limit: size, offset: all.length } }));
			all.push(...page);
			if (page.length < size) break;
		}
		return all;
	}

	// create / update
	const update = operation === 'update';
	const body = {};
	const name = clean(param('bookingCustomerName'));
	if (name) body.customer_name = name; else if (!update) throw new Error('Informe o nome do cliente.');
	const starts = clean(param('bookingStartsAt'));
	if (starts) body.starts_at = await when(starts, 'o Start'); else if (!update) throw new Error('Informe o Start do atendimento.');
	const ends = clean(param('bookingEndsAt'));
	if (ends) body.ends_at = await when(ends, 'o End'); else if (!update) throw new Error('Informe o End do atendimento.');
	if (body.starts_at && body.ends_at && body.ends_at <= body.starts_at) throw new Error('O End precisa ser depois do Start.');
	// Services of this business: one keeps its link (and its price); several become one appointment named after all of
	// them, priced with their sum. Nothing chosen: a plain "Atendimento".
	// From the list it is an array of IDs; from the AI it may arrive as one text, with the IDs separated by commas.
	const chosen = [].concat(param('bookingServicesChosen', [])).flatMap((id) => String(id).split(',')).map((id) => id.trim()).filter(Boolean);
	if (chosen.length) {
		const known = rows(await call({ method: 'GET', url: base('/services') }));
		const picked = chosen.map((id) => known.find((service) => service.id === id) || (() => { throw new Error('Um dos serviços escolhidos não é deste negócio.'); })());
		if (picked.length === 1) body.service_id = picked[0].id;
		else {
			body.service_name = picked.map((service) => service.name).join(' + ').slice(0, 160);
			if (picked.every((service) => service.price !== null && service.price !== undefined)) body.price = picked.reduce((sum, service) => sum + Number(service.price), 0).toFixed(2);
		}
	} else if (!update) body.service_name = 'Atendimento';
	if (!update) return rows(await call({ method: 'POST', url: base('/appointments'), body }));
	const status = clean(param('bookingStatus'));
	if (status) body.status = status;
	const id = String(param('bookingAppointmentId')).trim();
	if (!id) throw new Error('Informe o ID do agendamento.');
	if (Object.keys(body).length === 0) throw new Error('Informe pelo menos um campo para atualizar.');
	return rows(await call({ method: 'PATCH', url: base('/appointments/' + encodeURIComponent(id)), body }));
}

module.exports = {
	BOOKING_RESOURCES, CREDENTIAL, isBookingResource, bookingResourceOptions, bookingOperationOptions, bookingToolDescriptions,
	bookingFields, loadOptions, executeBooking, explain, instant, money, DEFAULT_BASE_URL,
};
