const test = require('node:test');
const assert = require('node:assert/strict');

const { Nexo } = require('../nodes/Nexo/Nexo.node');
const { NexoBookingApi } = require('../credentials/NexoBookingApi.credentials');
const { instant, calendarDay, money } = require('../nodes/Nexo/booking');

/** Runs the node for one item; `answer(options)` plays the API and every request is recorded. */
async function run(parameters, answer) {
	const requests = [];
	const credentials = [];
	const context = {
		getInputData: () => [{ json: {} }],
		getNodeParameter: (name, _index, fallback) => parameters[name] ?? fallback,
		getCredentials: async (name) => { credentials.push(name); return { baseUrl: 'https://nexo.test', apiKey: 'nexo_book_test' }; },
		helpers: { httpRequestWithAuthentication: async function (credential, options) { requests.push({ credential, ...options }); return answer(options); } },
	};
	return { output: await Nexo.prototype.execute.call(context), requests, credentials };
}
const business = { id: 'b1', name: 'Barbearia', timezone: 'America/Sao_Paulo' };
const BASE = { resource: 'bookingAppointments', bookingBusinessId: 'b1' };

test('Atendimentos resources expose operations, descriptions and a dedicated credential', () => {
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
	const [panel, booking] = node.description.credentials;
	assert.equal(panel.name, 'nexoApi');
	assert.deepEqual(panel.displayOptions.hide.resource, ['bookingBusinesses', 'bookingServices', 'bookingAppointments']);
	assert.equal(booking.name, 'nexoBookingApi');
	assert.deepEqual(booking.displayOptions.show.resource, panel.displayOptions.hide.resource);
	assert.equal(typeof node.methods.loadOptions.getBookingBusinesses, 'function');
});

test('every Atendimentos field can be filled by the AI model: none blocks expressions', () => {
	const node = new Nexo();
	const fields = node.description.properties.filter((field) => field.name.startsWith('booking'));
	assert.ok(fields.length > 15);
	assert.ok(fields.every((field) => !field.noDataExpression && !['collection', 'fixedCollection'].includes(field.type)));
	assert.ok(fields.every((field) => field.displayOptions.show.resource[0].startsWith('booking')));
});

test('the Atendimentos credential sends the key as a Bearer token and tests against the businesses route', () => {
	const credential = new NexoBookingApi();
	assert.equal(credential.name, 'nexoBookingApi');
	assert.equal(credential.authenticate.properties.headers.Authorization, '=Bearer {{$credentials.apiKey}}');
	assert.equal(credential.test.request.url, '/atendimentos/businesses');
	assert.ok(credential.properties.some((field) => field.name === 'apiKey' && field.typeOptions.password));
});

test('searching appointments by week sends the period like the calendar and uses the Atendimentos credential', async () => {
	const { output, requests, credentials } = await run({ ...BASE, operation: 'getMany', bookingPeriod: 'week', bookingDate: '2026-11-18T10:00:00.000-03:00', bookingWeekStarts: 'monday', bookingStatusFilter: 'confirmed', bookingCustomerFilter: ' Ana ' },
		() => [{ id: 'a1', customer_name: 'Ana' }, { id: 'a2', customer_name: 'Ana Maria' }]);
	assert.deepEqual(credentials, ['nexoBookingApi']);
	assert.equal(requests.length, 1);
	assert.equal(requests[0].credential, 'nexoBookingApi');
	assert.equal(requests[0].baseURL, 'https://nexo.test/');
	assert.equal(requests[0].url, 'atendimentos/businesses/b1/appointments');
	assert.deepEqual(requests[0].qs, { period: 'week', date: '2026-11-18', week_starts: 'monday', status: 'confirmed', customer: 'Ana', limit: 50, offset: 0 });
	assert.deepEqual(output[0].map((item) => item.json.id), ['a1', 'a2']);
});

test('the other periods map to the API, and "no period" sends none', async () => {
	for (const [period, expected] of [['today', { period: 'today' }], ['tomorrow', { period: 'tomorrow' }], ['month', { period: 'month' }], ['day', { period: 'day' }], ['next_7_days', { period: 'next_7_days' }], ['upcoming', { period: 'upcoming' }], ['all', {}]]) {
		const { requests } = await run({ ...BASE, operation: 'getMany', bookingPeriod: period }, () => []);
		assert.deepEqual(requests[0].qs, { ...expected, limit: 50, offset: 0 }, period);
	}
});

test('a custom range without a time zone is read in the business time zone', async () => {
	const { requests } = await run({ ...BASE, operation: 'getMany', bookingPeriod: 'custom', bookingFrom: '2026-11-16T00:00:00', bookingUntil: '2026-11-17 00:00' },
		(options) => (options.url.endsWith('/b1') ? business : []));
	assert.equal(requests[0].url, 'atendimentos/businesses/b1');
	assert.deepEqual(requests[1].qs, { starts_from: '2026-11-16T03:00:00.000Z', starts_until: '2026-11-17T03:00:00.000Z', limit: 50, offset: 0 });
	const bad = await run({ ...BASE, operation: 'getMany', bookingPeriod: 'custom', bookingFrom: '2026-11-17T00:00:00Z', bookingUntil: '2026-11-16T00:00:00Z' }, () => business).catch((error) => error);
	assert.match(bad.message, /depois de "De"/);
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

test('create books an appointment with a service id, converting the local time of the business', async () => {
	const { requests, output } = await run({ ...BASE, operation: 'create', bookingCustomerName: ' João ', bookingCustomerPhone: '11999999999', bookingStartsAt: '2026-11-16T09:00:00', bookingServiceId: 's1', bookingPrice: 'R$ 1.045,50' },
		(options) => (options.method === 'GET' ? business : { id: 'a1', customer_name: 'João' }));
	const post = requests.find((request) => request.method === 'POST');
	assert.equal(post.url, 'atendimentos/businesses/b1/appointments');
	assert.deepEqual(post.body, { customer_name: 'João', customer_phone: '11999999999', service_id: 's1', price: '1045.50', starts_at: '2026-11-16T12:00:00.000Z' });
	assert.equal(output[0][0].json.id, 'a1');
});

test('create needs a customer, a start and a service (or a service name with an end)', async () => {
	const fails = async (parameters, pattern) => assert.match((await run({ ...BASE, operation: 'create', ...parameters }, () => business).catch((error) => error)).message, pattern);
	await fails({ bookingStartsAt: '2026-11-16T09:00:00Z', bookingServiceId: 's1' }, /nome do cliente/);
	await fails({ bookingCustomerName: 'João', bookingServiceId: 's1' }, /início/);
	await fails({ bookingCustomerName: 'João', bookingStartsAt: '2026-11-16T09:00:00Z' }, /serviço/);
	await fails({ bookingCustomerName: 'João', bookingStartsAt: '2026-11-16T09:00:00Z', bookingServiceName: 'Corte' }, /serviço/);
	await fails({ bookingCustomerName: 'João', bookingStartsAt: '2026-11-16T09:00:00Z', bookingEndsAt: '2026-11-16T08:00:00Z', bookingServiceName: 'Corte' }, /depois do início/);
	await fails({ bookingCustomerName: 'João', bookingStartsAt: '2026-11-16T09:00:00Z', bookingServiceId: 's1', bookingPrice: 'caro' }, /Preço inválido/);
	const ok = await run({ ...BASE, operation: 'create', bookingCustomerName: 'João', bookingStartsAt: '2026-11-16T09:00:00Z', bookingEndsAt: '2026-11-16T09:30:00Z', bookingServiceName: 'Corte' }, () => ({ id: 'a1' }));
	assert.deepEqual(ok.requests[0].body, { customer_name: 'João', service_name: 'Corte', starts_at: '2026-11-16T09:00:00.000Z', ends_at: '2026-11-16T09:30:00.000Z' });
});

test('update sends only what was filled in, and delete confirms what it removed', async () => {
	const { requests } = await run({ ...BASE, operation: 'update', bookingAppointmentId: 'a1', bookingStatus: 'confirmed', bookingNotes: 'Trazer foto' }, () => ({ id: 'a1', status: 'confirmed' }));
	assert.equal(requests[0].method, 'PATCH');
	assert.equal(requests[0].url, 'atendimentos/businesses/b1/appointments/a1');
	assert.deepEqual(requests[0].body, { notes: 'Trazer foto', status: 'confirmed' });
	const empty = await run({ ...BASE, operation: 'update', bookingAppointmentId: 'a1' }, () => ({})).catch((error) => error);
	assert.match(empty.message, /pelo menos um campo/);
	const removed = await run({ ...BASE, operation: 'delete', bookingAppointmentId: 'a/1' }, () => undefined);
	assert.equal(removed.requests[0].method, 'DELETE');
	assert.equal(removed.requests[0].url, 'atendimentos/businesses/b1/appointments/a%2F1');
	assert.deepEqual(removed.output[0].map((item) => item.json), [{ id: 'a/1', deleted: true }]);
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

test('the business picker lists the account businesses with the Atendimentos credential', async () => {
	let used;
	const options = await new Nexo().methods.loadOptions.getBookingBusinesses.call({
		getCredentials: async (name) => { used = name; return { baseUrl: 'https://nexo.test/' }; },
		helpers: { httpRequestWithAuthentication: async (_credential, request) => { assert.equal(request.url, 'atendimentos/businesses'); return [{ id: 'b1', name: 'Barbearia', city: 'São Paulo', state: 'SP' }]; } },
	});
	assert.equal(used, 'nexoBookingApi');
	assert.deepEqual(options, [{ name: 'Barbearia', value: 'b1', description: 'São Paulo / SP' }]);
});

test('time helpers: local time of the business, explicit offsets, days and prices', () => {
	assert.equal(instant('2026-11-16T09:00:00', 'America/Sao_Paulo', 'x'), '2026-11-16T12:00:00.000Z');
	assert.equal(instant('2026-11-16 09:00', 'America/New_York', 'x'), '2026-11-16T14:00:00.000Z');
	assert.equal(instant('2026-11-16T09:00:00-05:00', 'America/Sao_Paulo', 'x'), '2026-11-16T14:00:00.000Z');
	assert.equal(instant('2026-11-16T09:00:00Z', 'America/Sao_Paulo', 'x'), '2026-11-16T09:00:00.000Z');
	assert.equal(instant('2026-07-01', 'Europe/Lisbon', 'x'), '2026-06-30T23:00:00.000Z');
	assert.throws(() => instant('amanhã', 'America/Sao_Paulo', 'o início'), /inválidas/);
	assert.throws(() => instant('', 'America/Sao_Paulo', 'o início'), /Informe o início/);
	assert.equal(calendarDay('2026-11-18T23:30:00-03:00'), '2026-11-18');
	assert.equal(calendarDay(''), '');
	assert.equal(money('45,00'), '45.00');
	assert.equal(money('1.234,5'), '1234.5');
	assert.equal(money('45.5'), '45.5');
	assert.equal(money(''), undefined);
	assert.throws(() => money('1,234,567'), /Preço inválido/);
});
