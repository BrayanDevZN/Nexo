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
		members: 'Listar a equipe de um negócio, com o ID de cada pessoa (usado em "Quem atende").',
	},
	bookingServices: { getMany: 'Listar os serviços de um negócio, com ID, duração e preço.' },
	bookingAppointments: {
		getMany: 'Buscar agendamentos de um negócio por período, como no calendário: hoje, amanhã, um dia, uma semana, um mês, próximos 7 ou 30 dias, todos os futuros ou um intervalo de datas. Filtra por situação, cliente e quem atende.',
		get: 'Consultar um agendamento pelo ID.',
		create: 'Marcar um atendimento: informe o cliente, o início e o serviço (ID) ou o nome do serviço com o fim.',
		update: 'Alterar um agendamento: remarcar, trocar serviço, quem atende, dados do cliente ou a situação (confirmar, concluir, cancelar, faltou).',
		delete: 'Apagar um agendamento.',
	},
};

const STATUS_OPTIONS = [{ name: 'Marcado', value: 'scheduled' }, { name: 'Confirmado', value: 'confirmed' }, { name: 'Concluído', value: 'done' }, { name: 'Cancelado', value: 'cancelled' }, { name: 'Não veio', value: 'no_show' }];
const PERIOD_OPTIONS = [
	{ name: 'Semana', value: 'week', description: 'Semana inteira do dia de referência (hoje, se não informar).' },
	{ name: 'Mês', value: 'month', description: 'Mês inteiro do dia de referência.' },
	{ name: 'Dia específico', value: 'day', description: 'O dia de referência (hoje, se não informar).' },
	{ name: 'Hoje', value: 'today' }, { name: 'Amanhã', value: 'tomorrow' },
	{ name: 'Próximos 7 dias', value: 'next_7_days' }, { name: 'Próximos 30 dias', value: 'next_30_days' },
	{ name: 'Todos os futuros', value: 'upcoming' },
	{ name: 'Intervalo de datas', value: 'custom', description: 'Do início ao fim informados.' },
	{ name: 'Sem período (todos)', value: 'all', description: 'Todos os agendamentos, dos mais antigos aos mais novos.' },
];

const bookingFields = [];
function add(displayName, name, type, defaultValue, resource, operations, extra = {}) {
	const show = { resource: [resource] };
	if (operations) show.operation = operations;
	const { displayOptions, ...rest } = extra;
	bookingFields.push({ displayName, name, type, default: defaultValue, displayOptions: { show: { ...show, ...(displayOptions?.show || {}) } }, ...rest });
}

const NEEDS_BUSINESS = { bookingBusinesses: ['get', 'overview', 'members'], bookingServices: ['getMany'], bookingAppointments: ['getMany', 'get', 'create', 'update', 'delete'] };
for (const [resource, operations] of Object.entries(NEEDS_BUSINESS)) {
	add('Negócio', 'bookingBusinessId', 'options', '', resource, operations, { required: true, typeOptions: { loadOptionsMethod: 'getBookingBusinesses' }, description: 'Lista todos os negócios da sua conta do Atendimentos: escolha qual agenda mexer. Com a IA, informe o ID (veja em Negócios > Get Many).' });
}
// Services
add('Só serviços ativos', 'bookingActiveOnly', 'boolean', false, 'bookingServices', ['getMany'], { description: 'Esconde os serviços desativados.' });
// Appointments: search by period, like the calendar
add('Período', 'bookingPeriod', 'options', 'week', 'bookingAppointments', ['getMany'], { options: PERIOD_OPTIONS, description: 'Como no calendário: o período é calculado no fuso horário do negócio.' });
add('Dia de referência', 'bookingDate', 'dateTime', '', 'bookingAppointments', ['getMany'], { displayOptions: { show: { bookingPeriod: ['day', 'week', 'month'] } }, description: 'Qualquer dia da semana ou do mês que você quer ver. Vazio = hoje.' });
add('A semana começa no', 'bookingWeekStarts', 'options', 'sunday', 'bookingAppointments', ['getMany'], { displayOptions: { show: { bookingPeriod: ['week'] } }, options: [{ name: 'Domingo', value: 'sunday' }, { name: 'Segunda-feira', value: 'monday' }] });
add('De', 'bookingFrom', 'dateTime', '', 'bookingAppointments', ['getMany'], { displayOptions: { show: { bookingPeriod: ['custom'] } }, required: true, description: 'Início do intervalo. Sem fuso, vale o horário do negócio.' });
add('Até', 'bookingUntil', 'dateTime', '', 'bookingAppointments', ['getMany'], { displayOptions: { show: { bookingPeriod: ['custom'] } }, description: 'Fim do intervalo (não inclui este instante). Vazio = sem fim.' });
add('Situação', 'bookingStatusFilter', 'options', '', 'bookingAppointments', ['getMany'], { options: [{ name: 'Todas as situações', value: '' }, ...STATUS_OPTIONS] });
add('Nome do cliente contém', 'bookingCustomerFilter', 'string', '', 'bookingAppointments', ['getMany']);
add('ID de quem atende', 'bookingStaffFilter', 'string', '', 'bookingAppointments', ['getMany'], { description: 'Só os atendimentos dessa pessoa da equipe. Veja os IDs em "Listar equipe".' });
add('Devolver todos', 'bookingReturnAll', 'boolean', false, 'bookingAppointments', ['getMany'], { description: `Busca todas as páginas (até ${MAX_ROWS} agendamentos).` });
add('Limite', 'bookingLimit', 'number', 50, 'bookingAppointments', ['getMany'], { displayOptions: { show: { bookingReturnAll: [false] } }, typeOptions: { minValue: 1, maxValue: 500 } });
// Appointments: identify, create, update
add('ID do agendamento', 'bookingAppointmentId', 'string', '', 'bookingAppointments', ['get', 'update', 'delete'], { required: true });
add('Nome do cliente', 'bookingCustomerName', 'string', '', 'bookingAppointments', ['create'], { required: true });
add('Nome do cliente', 'bookingCustomerName', 'string', '', 'bookingAppointments', ['update'], { description: 'Vazio: não altera.' });
add('Celular do cliente', 'bookingCustomerPhone', 'string', '', 'bookingAppointments', ['create', 'update']);
add('E-mail do cliente', 'bookingCustomerEmail', 'string', '', 'bookingAppointments', ['create', 'update']);
add('Início', 'bookingStartsAt', 'dateTime', '', 'bookingAppointments', ['create'], { required: true, description: 'Sem fuso horário, vale o horário do negócio.' });
add('Início', 'bookingStartsAt', 'dateTime', '', 'bookingAppointments', ['update'], { description: 'Para remarcar. Vazio: não altera. Sem fuso horário, vale o horário do negócio.' });
add('Fim', 'bookingEndsAt', 'dateTime', '', 'bookingAppointments', ['create', 'update'], { description: 'Vazio: usa a duração do serviço (ou não altera, ao atualizar).' });
add('ID do serviço', 'bookingServiceId', 'string', '', 'bookingAppointments', ['create', 'update'], { description: 'Veja os IDs em Serviços > Get Many. Vazio: use o nome do serviço abaixo.' });
add('Nome do serviço', 'bookingServiceName', 'string', '', 'bookingAppointments', ['create', 'update'], { description: 'Só quando não houver ID de serviço; neste caso informe também o Fim.' });
add('ID de quem atende', 'bookingStaffId', 'string', '', 'bookingAppointments', ['create', 'update'], { description: 'Pessoa da equipe. Vazio: qualquer uma.' });
add('Preço (R$)', 'bookingPrice', 'string', '', 'bookingAppointments', ['create', 'update'], { description: 'Vazio: usa o preço do serviço. Ex.: 45,00.' });
add('Observações', 'bookingNotes', 'string', '', 'bookingAppointments', ['create', 'update'], { typeOptions: { rows: 3 } });
add('Situação', 'bookingStatus', 'options', '', 'bookingAppointments', ['update'], { options: [{ name: 'Não alterar', value: '' }, ...STATUS_OPTIONS] });

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
/** YYYY-MM-DD of a picked day, as written: the calendar day the person meant. */
function calendarDay(value) {
	const text = String(value ?? '').trim();
	if (!text) return '';
	const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
	if (match) return match[1];
	const date = new Date(text);
	if (Number.isNaN(date.getTime())) throw new Error('Dia de referência inválido.');
	return date.toISOString().slice(0, 10);
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

const loadOptions = {
	async getBookingBusinesses() {
		const credentials = await this.getCredentials(CREDENTIAL);
		const baseUrl = String(credentials.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
		const rows = await this.helpers.httpRequestWithAuthentication.call(this, CREDENTIAL, { method: 'GET', baseURL: `${baseUrl}/`, url: 'atendimentos/businesses', json: true, timeout: 30000 });
		return (Array.isArray(rows) ? rows : []).map((row) => ({ name: row.name, value: row.id, description: [row.city, row.state].filter(Boolean).join(' / ') || undefined }));
	},
};

/** Runs one input item of a booking operation and returns the JSON rows to emit. */
async function executeBooking(ctx, resource, operation, index, state) {
	const param = (name, fallback = '') => ctx.getNodeParameter(name, index, fallback);
	const call = (options) => ctx.helpers.httpRequestWithAuthentication.call(ctx, CREDENTIAL, { baseURL: `${state.baseUrl}/`, json: true, timeout: 30000, ...options });
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
		const period = String(param('bookingPeriod', 'week'));
		if (period === 'custom') {
			qs.starts_from = await when(param('bookingFrom'), 'o início do intervalo (De)');
			const until = clean(param('bookingUntil'));
			if (until) qs.starts_until = await when(until, 'o fim do intervalo (Até)');
			if (qs.starts_until && qs.starts_until <= qs.starts_from) throw new Error('"Até" precisa ser depois de "De".');
		} else if (period !== 'all') {
			qs.period = period;
			if (['day', 'week', 'month'].includes(period)) {
				const day = calendarDay(param('bookingDate'));
				if (day) qs.date = day;
				if (period === 'week') qs.week_starts = String(param('bookingWeekStarts', 'sunday'));
			}
		}
		for (const [field, apiField] of [['bookingStatusFilter', 'status'], ['bookingCustomerFilter', 'customer'], ['bookingStaffFilter', 'staff_user_id']]) {
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
	for (const [field, apiField] of [['bookingCustomerPhone', 'customer_phone'], ['bookingCustomerEmail', 'customer_email'], ['bookingServiceId', 'service_id'], ['bookingServiceName', 'service_name'], ['bookingStaffId', 'staff_user_id'], ['bookingNotes', 'notes']]) {
		const value = clean(param(field));
		if (value !== undefined) body[apiField] = value;
	}
	const price = money(param('bookingPrice'));
	if (price !== undefined) body.price = price;
	const starts = clean(param('bookingStartsAt'));
	if (starts) body.starts_at = await when(starts, 'o início'); else if (!update) throw new Error('Informe o início do atendimento.');
	const ends = clean(param('bookingEndsAt'));
	if (ends) body.ends_at = await when(ends, 'o fim');
	if (body.starts_at && body.ends_at && body.ends_at <= body.starts_at) throw new Error('O fim precisa ser depois do início.');
	if (!update && !body.service_id && !(body.service_name && body.ends_at)) throw new Error('Informe o ID do serviço, ou o nome do serviço junto com o fim.');
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
	bookingFields, loadOptions, executeBooking, instant, calendarDay, money, DEFAULT_BASE_URL,
};
