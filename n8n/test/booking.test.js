const test = require('node:test');
const assert = require('node:assert/strict');

const { Nexo } = require('../nodes/Nexo/Nexo.node');
const { instant, money } = require('../nodes/Nexo/booking');

/** Runs the node for one item; `answer(options)` plays the API and every request is recorded. */
async function run(parameters, answer) {
	const requests = [];
	const credentials = [];
	const context = {
		getInputData: () => [{ json: {} }],
		getNodeParameter: (name, _index, fallback) => parameters[name] ?? fallback,
		getCredentials: async (name) => { credentials.push(name); return { baseUrl: 'https://nexo.test', apiKey: 'nexo_live_test' }; },
		helpers: { httpRequestWithAuthentication: async function (credential, options) { requests.push({ credential, ...options }); return answer(options); } },
	};
	return { output: await Nexo.prototype.execute.call(context), requests, credentials };
}
const business = { id: 'b1', name: 'Barbearia', timezone: 'America/Sao_Paulo' };
const BASE = { resource: 'bookingAppointments', bookingBusinessId: 'b1' };

test('Atendimentos resources expose operations and descriptions, and use the regular Nexo API credential', () => {
	const node = new Nexo();
	assert.equal(node.description.usableAsTool, true);
	const resources = node.description.properties.find((field) => field.name === 'resource').options.map((option) => option.value);
	for (const resource of ['bookingBusinesses', 'bookingServices', 'bookingAppointments']) {
		assert.ok(resources.includes(resource));
		const operations = node.methods.loadOptions.getOperations.call({ getCurrentNodeParameter: () => resource });
		assert.ok(operations.length > 0 && operations.every((operation) => operation.action && operation.description));
	}
	const appointments = node.methods.loadOptions.getOperations.call({ getCurrentNodeParameter: () => 'bookingAppointments' }).map((operation) => operation.value);
	assert.deepEqual(appointments, ['getMany', 'get', 'create', 'update', 'delete']);
	assert.deepEqual(node.description.credentials.map((credential) => credential.name), ['nexoApi']);
	assert.equal(typeof node.methods.loadOptions.getBookingBusinesses, 'function');
});

test('every Atendimentos field can be filled by the AI model: none blocks expressions', () => {
	const node = new Nexo();
	const fields = node.description.properties.filter((field) => field.name.startsWith('booking'));
	assert.ok(fields.length > 15);
	// The business is the one field a person picks in the node; every other field takes the AI sparkle.
	assert.ok(fields.every((field) => (field.name === 'bookingBusinessId') === Boolean(field.noDataExpression)));
	assert.ok(fields.every((field) => !['collection', 'fixedCollection', 'resourceLocator'].includes(field.type)));
	assert.ok(fields.every((field) => field.displayOptions.show.resource[0].startsWith('booking')));
});

test('Return all pages through the results and stops at the end; the limit caps one request', async () => {
	const page = (size) => Array.from({ length: size }, (_, index) => ({ id: String(index) }));
	const offsets = [];
	const all = await run({ ...BASE, operation: 'getMany', bookingPeriod: 'all', bookingReturnAll: true }, (options) => { offsets.push(options.qs.offset); return options.qs.offset >= 200 ? page(30) : page(100); });
	assert.deepEqual(offsets, [0, 100, 200]);
	assert.equal(all.output[0].length, 230);
	const limited = await run({ ...BASE, operation: 'getMany', bookingPeriod: 'all', bookingReturnAll: false, bookingLimit: 120 }, (options) => page(options.qs.limit));
	assert.deepEqual(limited.requests.map((request) => [request.qs.limit, request.qs.offset]), [[100, 0], [20, 100]]);
	assert.equal(limited.output[0].length, 120);
});

test('businesses, team and services read from the Atendimentos routes', async () => {
	const list = await run({ resource: 'bookingBusinesses', operation: 'getMany' }, () => [business]);
	assert.equal(list.requests[0].url, 'atendimentos/businesses');
	assert.equal(list.output[0][0].json.id, 'b1');
	for (const [resource, operation, url] of [['bookingBusinesses', 'overview', 'overview'], ['bookingBusinesses', 'members', 'members'], ['bookingBusinesses', 'get', '']]) {
		const { requests } = await run({ resource, operation, bookingBusinessId: 'b1' }, () => ({}));
		assert.equal(requests[0].url, 'atendimentos/businesses/b1' + (url ? '/' + url : ''));
	}
	const services = await run({ resource: 'bookingServices', operation: 'getMany', bookingBusinessId: 'b1', bookingActiveOnly: true }, () => []);
	assert.equal(services.requests[0].url, 'atendimentos/businesses/b1/services');
	assert.deepEqual(services.requests[0].qs, { active: true });
	const missing = await run({ resource: 'bookingServices', operation: 'getMany' }, () => []).catch((error) => error);
	assert.match(missing.message, /Escolha o negócio/);
});

test('the business picker lists the account businesses with the regular Nexo API credential', async () => {
	let used;
	const options = await new Nexo().methods.loadOptions.getBookingBusinesses.call({
		getCredentials: async (name) => { used = name; return { baseUrl: 'https://nexo.test/' }; },
		helpers: { httpRequestWithAuthentication: async (_credential, request) => { assert.equal(request.url, 'atendimentos/businesses'); return [{ id: 'b1', name: 'Barbearia', city: 'São Paulo', state: 'SP' }]; } },
	});
	assert.equal(used, 'nexoApi');
	assert.deepEqual(options, [{ name: 'Barbearia', value: 'b1', description: 'São Paulo / SP' }]);
});

test('there is no "Quem atende" option: the node never asks for or sends who attends', async () => {
	const names = new Nexo().description.properties.map((field) => field.name);
	assert.ok(!names.includes('bookingStaffId') && !names.includes('bookingStaffFilter'));
	assert.equal(new Nexo().methods.loadOptions.getBookingMembers, undefined);
	const { requests } = await run({ ...BASE, operation: 'getMany', bookingPeriod: 'all', bookingStaffFilter: 'u1', bookingStaffId: 'u1' }, () => []);
	assert.ok(!('staff_user_id' in requests[0].qs));
});

test('time helpers: local time of the business, explicit offsets and prices', () => {
	assert.equal(instant('2026-11-16T09:00:00', 'America/Sao_Paulo', 'x'), '2026-11-16T12:00:00.000Z');
	assert.equal(instant('2026-11-16 09:00', 'America/New_York', 'x'), '2026-11-16T14:00:00.000Z');
	assert.equal(instant('2026-11-16T09:00:00-05:00', 'America/Sao_Paulo', 'x'), '2026-11-16T14:00:00.000Z');
	assert.equal(instant('2026-11-16T09:00:00Z', 'America/Sao_Paulo', 'x'), '2026-11-16T09:00:00.000Z');
	assert.equal(instant('2026-07-01', 'Europe/Lisbon', 'x'), '2026-06-30T23:00:00.000Z');
	assert.throws(() => instant('amanhã', 'America/Sao_Paulo', 'o início'), /inválidas/);
	assert.throws(() => instant('', 'America/Sao_Paulo', 'o início'), /Informe o início/);
	assert.equal(money('45,00'), '45.00');
	assert.equal(money('1.234,5'), '1234.5');
	assert.equal(money('45.5'), '45.5');
	assert.equal(money(''), undefined);
	assert.throws(() => money('1,234,567'), /Preço inválido/);
});

test('appointments can no longer be filtered by customer name', async () => {
	assert.ok(!new Nexo().description.properties.some((field) => field.name === 'bookingCustomerFilter'));
	const { requests } = await run({ ...BASE, operation: 'getMany', bookingPeriod: 'all', bookingCustomerFilter: 'Ana' }, () => []);
	assert.ok(!('customer' in requests[0].qs));
});

test('a 403 from the API is explained in Portuguese instead of "Forbidden"', async () => {
	const forbidden = (detail) => Object.assign(new Error('Forbidden - perhaps check your credentials?'), { httpCode: '403', cause: { response: { body: { detail } } } });
	const denied = forbidden('This API key cannot access this route');
	const loading = await new Nexo().methods.loadOptions.getBookingBusinesses.call({
		getCredentials: async () => ({ baseUrl: 'https://nexo.test' }),
		helpers: { httpRequestWithAuthentication: async () => { throw denied; } },
	}).catch((error) => error);
	assert.match(loading.message, /use uma chave de dono, administrador ou dev/);
	const running = await run({ resource: 'bookingBusinesses', operation: 'getMany' }, () => { throw denied; }).catch((error) => error);
	assert.match(running.message, /não tem permissão para o Atendimentos/);
	const account = await run({ resource: 'bookingBusinesses', operation: 'getMany' }, () => { throw forbidden('This action needs an Atendimentos account: do it in the Atendimentos app'); }).catch((error) => error);
	assert.match(account.message, /precisa de uma conta do Atendimentos/);
	const other = await run({ resource: 'bookingBusinesses', operation: 'getMany' }, () => { throw Object.assign(new Error('x'), { cause: { response: { body: '{"detail":"Business not found"}' } } }); }).catch((error) => error);
	assert.equal(other.message, 'Business not found');
	const untouched = new Error('timeout');
	assert.equal((await run({ resource: 'bookingBusinesses', operation: 'getMany' }, () => { throw untouched; }).catch((error) => error)), untouched);
});

test('appointments are searched between a Start and an End, like Google Calendar', async () => {
	const { output, requests, credentials } = await run({ ...BASE, operation: 'getMany', bookingStart: '2026-11-16T00:00:00-03:00', bookingEnd: '2026-11-17T00:00:00-03:00', bookingStatusFilter: 'confirmed' },
		() => [{ id: 'a1', customer_name: 'Ana' }, { id: 'a2', customer_name: 'Bia' }]);
	assert.deepEqual(credentials, ['nexoApi']);
	assert.equal(requests.length, 1);   // an explicit offset needs no look-up of the business time zone
	assert.equal(requests[0].credential, 'nexoApi');
	assert.equal(requests[0].url, 'atendimentos/businesses/b1/appointments');
	assert.deepEqual(requests[0].qs, { ends_after: '2026-11-16T03:00:00.000Z', starts_until: '2026-11-17T03:00:00.000Z', status: 'confirmed', limit: 50, offset: 0 });
	assert.deepEqual(output[0].map((item) => item.json.id), ['a1', 'a2']);
});

test('Start and End are optional, either alone works, and no window means everything', async () => {
	const only = async (parameters) => (await run({ ...BASE, operation: 'getMany', ...parameters }, () => [])).requests[0].qs;
	assert.deepEqual(await only({}), { limit: 50, offset: 0 });
	assert.deepEqual(await only({ bookingStart: '2026-11-16T09:00:00Z' }), { ends_after: '2026-11-16T09:00:00.000Z', limit: 50, offset: 0 });
	assert.deepEqual(await only({ bookingEnd: '2026-11-16T09:00:00Z' }), { starts_until: '2026-11-16T09:00:00.000Z', limit: 50, offset: 0 });
});

test('Start and End without a time zone are read in the business time zone', async () => {
	const { requests } = await run({ ...BASE, operation: 'getMany', bookingStart: '2026-11-16T00:00:00', bookingEnd: '2026-11-17 00:00' }, (options) => (options.url.endsWith('/b1') ? business : []));
	assert.equal(requests[0].url, 'atendimentos/businesses/b1');
	assert.deepEqual(requests[1].qs, { ends_after: '2026-11-16T03:00:00.000Z', starts_until: '2026-11-17T03:00:00.000Z', limit: 50, offset: 0 });
	const bad = await run({ ...BASE, operation: 'getMany', bookingStart: '2026-11-17T00:00:00Z', bookingEnd: '2026-11-16T00:00:00Z' }, () => []).catch((error) => error);
	assert.match(bad.message, /End precisa ser depois do Start/);
	const invalid = await run({ ...BASE, operation: 'getMany', bookingStart: 'amanhã' }, () => business).catch((error) => error);
	assert.match(invalid.message, /inválidas/);
});

test('there are no period presets any more: only Start and End, both plain fields the AI can fill', () => {
	const properties = new Nexo().description.properties;
	assert.ok(!properties.some((field) => ['bookingPeriod', 'bookingDate', 'bookingWeekStarts', 'bookingFrom', 'bookingUntil'].includes(field.name)));
	for (const name of ['bookingStart', 'bookingEnd']) {
		const field = properties.find((candidate) => candidate.name === name);
		assert.equal(field.type, 'dateTime');
		assert.deepEqual(Object.keys(field.displayOptions.show).sort(), ['operation', 'resource']);   // never hidden behind another field
		assert.ok(!field.noDataExpression && !field.required);
		assert.match(field.description, /ISO 8601/);
	}
});

test('the node is tool-ready: every Atendimentos field has a description for the model and the tool description says what it does', () => {
	const node = new Nexo();
	assert.equal(node.description.usableAsTool, true);
	assert.deepEqual(node.description.inputs, ['main']);
	assert.match(node.description.description, /Atendimentos/);
	assert.match(node.description.description, /Start\/End/);
	const fields = node.description.properties.filter((field) => field.name.startsWith('booking'));
	for (const field of fields) assert.ok(field.description && field.description.length > 10, field.name);
});

const SERVICES = [{ id: 's1', name: 'Corte', price: 45, duration_minutes: 30 }, { id: 's2', name: 'Barba', price: 30.5, duration_minutes: 20 }, { id: 's3', name: 'Sobrancelha', price: null, duration_minutes: 10 }];
const answer = (options) => (options.url.endsWith('/b1') ? business : options.url.endsWith('/services') ? SERVICES : { id: 'a1' });
const CREATE = { ...BASE, operation: 'create', bookingCustomerName: ' João ', bookingStartsAt: '2026-11-16T09:00:00', bookingEndsAt: '2026-11-16T10:00:00' };

test('creating asks only for the customer name, Start, End and the services, with no phone, e-mail, ID, price or client picker', () => {
	const fields = new Nexo().description.properties.filter((field) => field.name.startsWith('booking') && field.displayOptions.show.resource[0] === 'bookingAppointments' && field.displayOptions.show.operation?.includes('create')).map((field) => field.name);
	assert.deepEqual(fields, ['bookingBusinessId', 'bookingCustomerName', 'bookingStartsAt', 'bookingEndsAt', 'bookingServicesChosen']);
	const properties = new Nexo().description.properties;
	assert.ok(!properties.some((field) => ['bookingClient', 'bookingCustomerPhone', 'bookingCustomerEmail', 'bookingServiceId', 'bookingServiceName', 'bookingPrice', 'bookingNotes', 'bookingStaffId'].includes(field.name)));
	assert.equal(new Nexo().methods.listSearch, undefined);
	const services = properties.find((field) => field.name === 'bookingServicesChosen');
	assert.equal(services.type, 'multiOptions');
	assert.equal(services.typeOptions.loadOptionsMethod, 'getBookingServices');
	assert.deepEqual(services.typeOptions.loadOptionsDependsOn, ['bookingBusinessId']);
	for (const name of ['bookingCustomerName', 'bookingStartsAt', 'bookingEndsAt']) assert.equal(properties.find((field) => field.name === name && field.displayOptions.show.operation.includes('create')).required, true);
});

test('create converts the local time of the business and sends one service by its ID', async () => {
	const { requests, output } = await run({ ...CREATE, bookingServicesChosen: ['s1'] }, answer);
	const post = requests.find((request) => request.method === 'POST');
	assert.equal(post.url, 'atendimentos/businesses/b1/appointments');
	assert.deepEqual(post.body, { customer_name: 'João', starts_at: '2026-11-16T12:00:00.000Z', ends_at: '2026-11-16T13:00:00.000Z', service_id: 's1' });
	assert.equal(output[0][0].json.id, 'a1');
});

test('several services become one appointment named after all of them, priced with their sum', async () => {
	const { requests } = await run({ ...CREATE, bookingServicesChosen: ['s1', 's2'] }, answer);
	assert.deepEqual(requests.find((request) => request.method === 'POST').body, { customer_name: 'João', starts_at: '2026-11-16T12:00:00.000Z', ends_at: '2026-11-16T13:00:00.000Z', service_name: 'Corte + Barba', price: '75.50' });
	const noPrice = await run({ ...CREATE, bookingServicesChosen: ['s1', 's3'] }, answer);
	const body = noPrice.requests.find((request) => request.method === 'POST').body;
	assert.equal(body.service_name, 'Corte + Sobrancelha');
	assert.ok(!('price' in body));
	const none = await run({ ...CREATE }, answer);
	assert.equal(none.requests.find((request) => request.method === 'POST').body.service_name, 'Atendimento');
	const foreign = await run({ ...CREATE, bookingServicesChosen: ['s1', 'other-business'] }, answer).catch((error) => error);
	assert.match(foreign.message, /não é deste negócio/);
});

test('create needs the name, Start and End, in order', async () => {
	const fails = async (parameters, pattern) => assert.match((await run({ ...BASE, operation: 'create', ...parameters }, answer).catch((error) => error)).message, pattern);
	await fails({ bookingStartsAt: '2026-11-16T09:00:00Z', bookingEndsAt: '2026-11-16T10:00:00Z' }, /nome do cliente/);
	await fails({ bookingCustomerName: 'João', bookingEndsAt: '2026-11-16T10:00:00Z' }, /Start/);
	await fails({ bookingCustomerName: 'João', bookingStartsAt: '2026-11-16T09:00:00Z' }, /End/);
	await fails({ bookingCustomerName: 'João', bookingStartsAt: '2026-11-16T09:00:00Z', bookingEndsAt: '2026-11-16T08:00:00Z' }, /depois do Start/);
});

test('"Serviços" lists the active services of the chosen business, with duration and price', async () => {
	const load = (business) => new Nexo().methods.loadOptions.getBookingServices.call({
		getCurrentNodeParameter: () => business,
		getCredentials: async () => ({ baseUrl: 'https://nexo.test' }),
		helpers: { httpRequestWithAuthentication: async (credential, request) => { assert.equal(credential, 'nexoApi'); assert.equal(request.url, 'atendimentos/businesses/b1/services'); assert.deepEqual(request.qs, { active: true }); return SERVICES; } },
	});
	assert.deepEqual(await load('b1'), [{ name: 'Corte', value: 's1', description: '30 min · R$ 45,00' }, { name: 'Barba', value: 's2', description: '20 min · R$ 30,50' }, { name: 'Sobrancelha', value: 's3', description: '10 min' }]);
	assert.deepEqual(await load(''), []);
});

test('update changes only what was filled in, including the services, and delete confirms what it removed', async () => {
	const { requests } = await run({ ...BASE, operation: 'update', bookingAppointmentId: 'a1', bookingStatus: 'confirmed', bookingServicesChosen: ['s2'] }, answer);
	const patch = requests.find((request) => request.method === 'PATCH');
	assert.equal(patch.url, 'atendimentos/businesses/b1/appointments/a1');
	assert.deepEqual(patch.body, { service_id: 's2', status: 'confirmed' });
	const empty = await run({ ...BASE, operation: 'update', bookingAppointmentId: 'a1' }, answer).catch((error) => error);
	assert.match(empty.message, /pelo menos um campo/);
	const removed = await run({ ...BASE, operation: 'delete', bookingAppointmentId: 'a/1' }, () => undefined);
	assert.equal(removed.requests[0].url, 'atendimentos/businesses/b1/appointments/a%2F1');
	assert.deepEqual(removed.output[0].map((item) => item.json), [{ id: 'a/1', deleted: true }]);
});

test('the services can come from the AI as one text with commas, or from the list as an array', async () => {
	const SVC = [{ id: 's1', name: 'Corte', price: 45 }, { id: 's2', name: 'Barba', price: 30 }];
	const reply = (options) => (options.url.endsWith('/b1') ? business : options.url.endsWith('/services') ? SVC : { id: 'a1' });
	for (const chosen of ['s1, s2', ['s1', 's2'], ['s1,s2']]) {
		const { requests } = await run({ ...BASE, operation: 'create', bookingCustomerName: 'João', bookingStartsAt: '2026-11-16T09:00:00Z', bookingEndsAt: '2026-11-16T10:00:00Z', bookingServicesChosen: chosen }, reply);
		const body = requests.find((request) => request.method === 'POST').body;
		assert.equal(body.service_name, 'Corte + Barba');
		assert.equal(body.price, '75.00');
	}
});

test('a service is created with a name and a duration; price, description and active are optional and the AI can fill them', async () => {
	const fields = new Nexo().description.properties.filter((field) => field.name.startsWith('bookingNewService'));
	assert.deepEqual(fields.map((field) => field.name), ['bookingNewServiceName', 'bookingNewServiceDuration', 'bookingNewServicePrice', 'bookingNewServiceDescription', 'bookingNewServiceActive']);
	assert.ok(fields.every((field) => !field.noDataExpression && field.description && field.displayOptions.show.operation[0] === 'create'));
	const operations = new Nexo().methods.loadOptions.getOperations.call({ getCurrentNodeParameter: () => 'bookingServices' });
	assert.deepEqual(operations.map((operation) => operation.value), ['getMany', 'create']);
	assert.ok(operations.every((operation) => operation.action && operation.description));
	const full = await run({ resource: 'bookingServices', operation: 'create', bookingBusinessId: 'b1', bookingNewServiceName: ' Corte masculino ', bookingNewServiceDuration: 45, bookingNewServicePrice: 'R$ 45,00', bookingNewServiceDescription: 'Máquina e tesoura', bookingNewServiceActive: false }, () => ({ id: 's1' }));
	assert.equal(full.requests[0].method, 'POST');
	assert.equal(full.requests[0].url, 'atendimentos/businesses/b1/services');
	assert.deepEqual(full.requests[0].body, { name: 'Corte masculino', duration_minutes: 45, active: false, price: '45.00', description: 'Máquina e tesoura' });
	assert.equal(full.output[0][0].json.id, 's1');
	const minimal = await run({ resource: 'bookingServices', operation: 'create', bookingBusinessId: 'b1', bookingNewServiceName: 'Barba' }, () => ({ id: 's2' }));
	assert.deepEqual(minimal.requests[0].body, { name: 'Barba', duration_minutes: 30, active: true });
	const fails = async (parameters, pattern) => assert.match((await run({ resource: 'bookingServices', operation: 'create', bookingBusinessId: 'b1', ...parameters }, () => ({})).catch((error) => error)).message, pattern);
	await fails({}, /nome do serviço/);
	await fails({ bookingNewServiceName: 'Barba', bookingNewServiceDuration: 3 }, /de 5 a 1440/);
	await fails({ bookingNewServiceName: 'Barba', bookingNewServiceDuration: 'longo' }, /de 5 a 1440/);
	await fails({ bookingNewServiceName: 'Barba', bookingNewServicePrice: 'caro' }, /Preço inválido/);
});
