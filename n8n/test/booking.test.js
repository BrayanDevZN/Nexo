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
	assert.ok(fields.every((field) => !field.noDataExpression && !['collection', 'fixedCollection'].includes(field.type)));
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
	await fails({ bookingStartsAt: '2026-11-16T09:00:00Z', bookingServiceId: 's1' }, /Escolha o cliente/);
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

test('the Cliente field is a searchable list of the clients registered in Nexo, or an ID', () => {
	const node = new Nexo();
	for (const operation of ['create', 'update']) {
		const field = node.description.properties.find((item) => item.name === 'bookingClient' && item.displayOptions.show.operation.includes(operation));
		assert.equal(field.type, 'resourceLocator');
		assert.deepEqual(field.modes.map((mode) => mode.name), ['list', 'id']);
		assert.equal(field.modes[0].typeOptions.searchListMethod, 'searchClients');
		assert.equal(field.modes[0].typeOptions.searchable, true);
		assert.ok(!field.noDataExpression && !field.required);
	}
	assert.equal(typeof node.methods.listSearch.searchClients, 'function');
});

test('searching the client list filters by name, pages with a token and shows the contact', async () => {
	const requests = [];
	const context = {
		getCredentials: async (name) => { requests.push(name); return { baseUrl: 'https://nexo.test' }; },
		helpers: { httpRequestWithAuthentication: async (credential, request) => { requests.push([credential, request.url, request.qs]); return request.qs.offset === 0 ? Array.from({ length: 100 }, (_, index) => ({ id: 'c' + index, name: 'Maria ' + index, phone: index ? null : '+5511999990000', email: null })) : [{ id: 'z', name: 'Zélia', phone: null, email: 'z@x.com' }]; } },
	};
	const search = new Nexo().methods.listSearch.searchClients;
	const first = await search.call(context, ' maria ');
	assert.deepEqual(requests.slice(0, 2), ['nexoApi', ['nexoApi', 'clients', { limit: 100, offset: 0, name: 'maria' }]]);
	assert.equal(first.results.length, 100);
	assert.deepEqual(first.results[0], { name: 'Maria 0', value: 'c0', description: '+5511999990000' });
	assert.equal(first.results[1].description, undefined);
	assert.equal(first.paginationToken, '100');
	const second = await search.call(context, undefined, '100');
	assert.deepEqual(second.results, [{ name: 'Zélia', value: 'z', description: 'z@x.com' }]);
	assert.equal(second.paginationToken, undefined);
});

test('a client chosen from the list fills the customer of the appointment, and what is typed wins', async () => {
	const answer = (options) => (options.url.startsWith('clients/') ? { id: 'c1', name: 'Maria Souza', phone: '+5511988887777', email: 'maria@example.com' } : { id: 'a1' });
	const chosen = await run({ ...BASE, operation: 'create', bookingClient: 'c1', bookingStartsAt: '2026-11-16T09:00:00Z', bookingServiceId: 's1' }, answer);
	assert.equal(chosen.requests[0].url, 'clients/c1');
	assert.equal(chosen.requests[0].credential, 'nexoApi');
	assert.deepEqual(chosen.requests[1].body, { customer_name: 'Maria Souza', customer_phone: '+5511988887777', customer_email: 'maria@example.com', service_id: 's1', starts_at: '2026-11-16T09:00:00.000Z' });
	const typed = await run({ ...BASE, operation: 'create', bookingClient: 'c1', bookingCustomerPhone: '11977776666', bookingStartsAt: '2026-11-16T09:00:00Z', bookingServiceId: 's1' }, answer);
	assert.equal(typed.requests[1].body.customer_name, 'Maria Souza');
	assert.equal(typed.requests[1].body.customer_phone, '11977776666');
	// Updating with a client changes the customer; without one, nothing about the customer is sent.
	const update = await run({ ...BASE, operation: 'update', bookingAppointmentId: 'a1', bookingClient: 'c1' }, answer);
	assert.deepEqual(update.requests[1].body, { customer_name: 'Maria Souza', customer_phone: '+5511988887777', customer_email: 'maria@example.com' });
	const plain = await run({ ...BASE, operation: 'update', bookingAppointmentId: 'a1', bookingStatus: 'done' }, answer);
	assert.equal(plain.requests.length, 1);
	assert.deepEqual(plain.requests[0].body, { status: 'done' });
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
