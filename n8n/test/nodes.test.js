const test = require('node:test');
const assert = require('node:assert/strict');

const { Nexo } = require('../nodes/Nexo/Nexo.node');
const { NexoTrigger, formatTriggerItem } = require('../nodes/Nexo/NexoTrigger.node');

async function executeNexo(parameters, response) {
	let request;
	const context = {
		getInputData: () => [{ json: {} }],
		getNodeParameter: (name, _index, fallback) => parameters[name] ?? fallback,
		getCredentials: async () => ({ baseUrl: 'https://nexo.test', apiKey: 'test' }),
		helpers: {
			httpRequestWithAuthentication: async function (_credential, options) {
				request = options;
				return response;
			},
		},
	};
	return { output: await Nexo.prototype.execute.call(context), request };
}

test('client niche filter is a closed options list', () => {
	const node = new Nexo();
	const nicheField = node.description.properties.find((field) => field.name === 'filterNiche');
	assert.equal(nicheField.type, 'options');
	assert.equal(nicheField.options[0].value, '');
	assert.ok(nicheField.options.some((option) => option.value === 'Contabilidade'));
	assert.ok(nicheField.options.some((option) => option.value === 'Outro'));
});

test('resource operations expose Get Many and Get', () => {
	const node = new Nexo();
	assert.equal(node.description.usableAsTool, true);
	for (const resource of ['clients', 'automations', 'documents', 'notifications']) {
		const operations = node.methods.loadOptions.getOperations.call({ getCurrentNodeParameter: () => resource });
		assert.ok(operations.some((operation) => operation.value === 'getMany' && operation.name === 'Get Many'));
		assert.ok(operations.some((operation) => operation.value === 'get' && operation.name === 'Get'));
		assert.ok(operations.every((operation) => operation.action && operation.description));
	}
});

test('client Get Many applies filters and returns each record as its own JSON item', async () => {
	const client = { id: 'c1', name: 'Empresa', niche: 'Varejo', contract_closed: true };
	const { output, request } = await executeNexo({
		resource: 'clients', operation: 'getMany', filterNiche: 'Varejo',
		filterContractClosed: 'true', limit: 10, offset: 0,
	}, [client]);
	assert.equal(request.qs.niche, 'Varejo');
	assert.equal(request.qs.contract_closed, 'true');
	assert.deepEqual(output[0], [{ json: client, pairedItem: { item: 0 } }]);
});

test('client update omits an empty contract value and sends valid numeric values', async () => {
	const base = { resource: 'clients', operation: 'update', updateLookupBy: 'id', updateLookupValue: 'client-1' };
	const emptyValue = await executeNexo({ ...base, contractValue: Number.NaN }, { id: 'client-1' });
	assert.equal(emptyValue.request.method, 'PATCH');
	assert.equal(Object.hasOwn(emptyValue.request.body, 'contract_value'), false);

	const numericValue = await executeNexo({ ...base, contractValue: 1250.5 }, { id: 'client-1' });
	assert.equal(numericValue.request.body.contract_value, 1250.5);
});

test('client create and update send the address', async () => {
	const created = await executeNexo({ resource: 'clients', operation: 'create', name: 'Padaria X', niche: 'Alimentação', address: 'Rua A, 1' }, { id: 'client-1' });
	assert.equal(created.request.body.address, 'Rua A, 1');
	const updated = await executeNexo({ resource: 'clients', operation: 'update', updateLookupBy: 'id', updateLookupValue: 'client-1', address: 'Rua B, 2' }, { id: 'client-1' });
	assert.equal(updated.request.body.address, 'Rua B, 2');
});

test('client search detects a UUID and can search a name', async () => {
	const id = '82f0ae21-45a8-4df1-a420-75d4dd452b25';
	const byId = await executeNexo({ resource: 'clients', operation: 'search', searchTerm: id, searchBy: 'auto' }, { id });
	assert.equal(byId.request.url, `clients/${id}`);
	assert.deepEqual(byId.output[0][0].json, { id });

	const byName = await executeNexo({ resource: 'clients', operation: 'search', searchTerm: 'Empresa', searchBy: 'auto' }, []);
	assert.equal(byName.request.url, 'clients');
	assert.deepEqual(byName.request.qs, { name: 'Empresa', limit: 100, offset: 0 });
	assert.deepEqual(byName.output[0], []);
});

test('Get automation calls the individual metadata endpoint', async () => {
	const { output, request } = await executeNexo({ resource: 'automations', operation: 'get', identifier: 'a/1' }, { id: 'a/1', name: 'Fluxo' });
	assert.equal(request.url, 'automations/a%2F1');
	assert.deepEqual(output[0][0].json, { id: 'a/1', name: 'Fluxo' });
});

test('trigger is webhook based instead of polling', () => {
	const node = new NexoTrigger();
	assert.equal(node.description.polling, undefined);
	assert.equal(node.description.webhooks[0].httpMethod, 'POST');
	assert.equal(node.description.version, 2);
});

test('trigger returns event data directly to the next node', () => {
	const client = { id: 'c1', name: 'Empresa', niche: 'Varejo' };
	assert.deepEqual(formatTriggerItem({ event: 'newClient', data: client }), { json: client });
});

test('trigger registers selected event using its n8n webhook URL', async () => {
	const node = new NexoTrigger();
	const staticData = {};
	let request;
	const context = {
		getWorkflowStaticData: () => staticData,
		getNodeParameter: () => 'newClient',
		getCredentials: async () => ({ baseUrl: 'https://nexo.test' }),
		getNodeWebhookUrl: () => 'https://n8n.example/webhook/nexo-event',
		helpers: {
			httpRequestWithAuthentication: async function (_credential, options) {
				request = options;
				return { id: 'sub-1' };
			},
		},
	};
	assert.equal(await node.webhookMethods.default.create.call(context), true);
	assert.deepEqual(staticData.subscriptions['https://n8n.example/webhook/nexo-event'], { id: 'sub-1', event: 'newClient' });
	assert.equal(request.baseURL, 'https://nexo.test/');
	assert.equal(request.url, 'event-subscriptions');
	assert.deepEqual(request.body, {
		event: 'newClient', webhook_url: 'https://n8n.example/webhook/nexo-event',
	});
});

test('trigger webhook emits only the event data', async () => {
	const client = { id: 'c1', name: 'Empresa' };
	const output = await NexoTrigger.prototype.webhook.call({
		getBodyData: () => ({ event: 'newClient', data: client }),
		helpers: { returnJsonArray: (items) => items.map((json) => ({ json })) },
	});
	assert.deepEqual(output, { workflowData: [[{ json: client }]] });
});

test('test webhook registers independently and returns the created client', async () => {
	const node = new NexoTrigger();
	const production = 'https://n8n.example/webhook/nexo-event';
	const manual = 'https://n8n.example/webhook-test/nexo-event';
	const staticData = { subscriptions: { [production]: { id: 'prod', event: 'newClient' } } };
	const requests = [];
	const context = {
		getWorkflowStaticData: () => staticData,
		getNodeParameter: () => 'newClient',
		getNodeWebhookUrl: () => manual,
		getCredentials: async () => ({ baseUrl: 'https://nexo.test' }),
		helpers: { httpRequestWithAuthentication: async function (_credential, options) {
			requests.push(options);
			if (options.method === 'GET') return { id: 'test', event: 'newClient', url: manual };
			return { id: 'test' };
		} },
	};
	assert.equal(await node.webhookMethods.default.checkExists.call(context), false);
	await node.webhookMethods.default.create.call(context);
	assert.equal(requests[0].body.webhook_url, manual);
	assert.equal(await node.webhookMethods.default.checkExists.call(context), true);
	assert.deepEqual(staticData.subscriptions[production], { id: 'prod', event: 'newClient' });
	const client = { id: 'c1', name: 'Empresa' };
	assert.deepEqual(await node.webhook.call({
		getBodyData: () => ({ event: 'newClient', data: client }),
		helpers: { returnJsonArray: (items) => items.map((json) => ({ json })) },
	}), { workflowData: [[{ json: client }]] });
	await node.webhookMethods.default.delete.call(context);
	assert.equal(requests[2].url, 'event-subscriptions/test');
	assert.equal(staticData.subscriptions[manual], undefined);
	assert.deepEqual(staticData.subscriptions[production], { id: 'prod', event: 'newClient' });
});

test('changing selected event registers a new subscription', async () => {
	const node = new NexoTrigger();
	const url = 'https://n8n.example/webhook/nexo-event';
	const staticData = { subscriptions: { [url]: { id: 'old', event: 'any' } } };
	const requests = [];
	const context = {
		getWorkflowStaticData: () => staticData,
		getNodeParameter: () => 'newClient',
		getNodeWebhookUrl: () => url,
		getCredentials: async () => ({ baseUrl: 'https://nexo.test' }),
		helpers: { httpRequestWithAuthentication: async function (_credential, options) {
			requests.push(options);
			return { id: 'new' };
		} },
	};
	assert.equal(await node.webhookMethods.default.checkExists.call(context), false);
	await node.webhookMethods.default.create.call(context);
	assert.deepEqual(requests.map((request) => request.method), ['POST', 'DELETE']);
	assert.equal(requests[1].url, 'event-subscriptions/old');
	assert.deepEqual(staticData.subscriptions[url], { id: 'new', event: 'newClient' });
});

test('trigger recreates subscription missing from the backend', async () => {
	const node = new NexoTrigger();
	const url = 'https://n8n.example/webhook-test/nexo-event';
	const staticData = { subscriptions: { [url]: { id: 'stale', event: 'newClient' } } };
	const requests = [];
	const context = {
		getWorkflowStaticData: () => staticData,
		getNodeParameter: () => 'newClient',
		getNodeWebhookUrl: () => url,
		getCredentials: async () => ({ baseUrl: 'https://nexo.test' }),
		helpers: { httpRequestWithAuthentication: async function (_credential, options) {
			requests.push(options);
			if (options.method === 'GET') throw { statusCode: 404 };
			if (options.method === 'DELETE') throw { statusCode: 404 };
			return { id: 'fresh' };
		} },
	};
	assert.equal(await node.webhookMethods.default.checkExists.call(context), false);
	await node.webhookMethods.default.create.call(context);
	assert.deepEqual(requests.map((request) => request.method), ['GET', 'POST', 'DELETE']);
	assert.deepEqual(staticData.subscriptions[url], { id: 'fresh', event: 'newClient' });
});

const MAPS_JOB = '3f2c1c1e-0000-4000-8000-000000000001';
const MAPS_SEARCH = { resource: 'maps', operation: 'create', mapsName: 'Contadores SP', mapsKeywords: 'escritório de contabilidade, contador\n', mapsLat: '-23,5505', mapsLon: '-46.6333', mapsRadius: 5000, mapsZoom: 15, mapsDepth: 2, mapsLang: 'pt', mapsEmail: true, mapsFastMode: false, mapsMaxTime: 300 };

test('Maps is a resource with search operations that expose an action and description', () => {
	const node = new Nexo();
	assert.ok(node.description.properties.find((field) => field.name === 'resource').options.some((option) => option.value === 'maps'));
	const operations = node.methods.loadOptions.getOperations.call({ getCurrentNodeParameter: () => 'maps' });
	assert.deepEqual(operations.map((operation) => operation.value), ['create', 'getMany', 'get', 'results', 'delete']);
	assert.ok(operations.every((operation) => operation.action && operation.description));
	const { NexoApi } = require('../credentials/NexoApi.credentials');
	assert.ok(new NexoApi().properties.some((field) => field.name === 'mapsUrl'));
});

test('Maps create sends the documented body to the maps server, with coordinates as text', async () => {
	const { output, request } = await executeNexo(MAPS_SEARCH, { id: MAPS_JOB });
	assert.equal(request.method, 'POST');
	assert.equal(request.baseURL, 'https://nexo-production-52a1.up.railway.app/');
	assert.equal(request.url, 'api/v1/jobs');
	assert.deepEqual(request.body, {
		name: 'Contadores SP', keywords: ['escritório de contabilidade', 'contador'], lang: 'pt', lat: '-23.5505', lon: '-46.6333',
		zoom: 15, radius: 5000, depth: 2, email: true, fast_mode: false, max_time: 300,
	});
	assert.deepEqual(output[0], [{ json: { id: MAPS_JOB }, pairedItem: { item: 0 } }]);
});

test('Maps create uses the maps URL from the credential', async () => {
	let request;
	const context = {
		getInputData: () => [{ json: {} }],
		getNodeParameter: (name, _index, fallback) => MAPS_SEARCH[name] ?? fallback,
		getCredentials: async () => ({ baseUrl: 'https://nexo.test', mapsUrl: 'https://maps.test/', apiKey: 'test' }),
		helpers: { httpRequestWithAuthentication: async function (_credential, options) { request = options; return { id: MAPS_JOB }; } },
	};
	await Nexo.prototype.execute.call(context);
	assert.equal(request.baseURL, 'https://maps.test/');
});

test('Maps create rejects invalid input before any request reaches the maps server', async () => {
	const invalid = [
		[{ mapsKeywords: ' , ' }, /palavra-chave/], [{ mapsKeywords: Array.from({ length: 11 }, (_, n) => `k${n}`).join(',') }, /no máximo 10/],
		[{ mapsKeywords: 'x'.repeat(121) }, /120 caracteres/], [{ mapsLat: '95' }, /Latitude inválida/], [{ mapsLat: '' }, /Latitude inválida/],
		[{ mapsLon: 'abc' }, /Longitude inválida/], [{ mapsLon: '181' }, /Longitude inválida/], [{ mapsRadius: 5 }, /raio/],
		[{ mapsDepth: 0 }, /profundidade/], [{ mapsMaxTime: 5000 }, /tempo máximo/],
	];
	for (const [override, message] of invalid) {
		let sent = 0;
		const parameters = { ...MAPS_SEARCH, ...override };
		const context = {
			getInputData: () => [{ json: {} }],
			getNodeParameter: (name, _index, fallback) => parameters[name] ?? fallback,
			getCredentials: async () => ({ baseUrl: 'https://nexo.test', apiKey: 'test' }),
			helpers: { httpRequestWithAuthentication: async () => { sent++; return {}; } },
		};
		await assert.rejects(Nexo.prototype.execute.call(context), message);
		assert.equal(sent, 0, JSON.stringify(override));
	}
});

test('Maps Get Many and Get read from the maps server and return one item per search', async () => {
	const jobs = [{ ID: MAPS_JOB, Name: 'Contadores SP', Status: 'ok' }, { ID: 'b', Name: 'Outra', Status: 'working' }];
	const list = await executeNexo({ resource: 'maps', operation: 'getMany' }, jobs);
	assert.equal(list.request.url, 'api/v1/jobs');
	assert.equal(list.request.baseURL, 'https://nexo-production-52a1.up.railway.app/');
	assert.deepEqual(list.output[0].map((item) => item.json), jobs);
	assert.deepEqual((await executeNexo({ resource: 'maps', operation: 'getMany' }, null)).output[0], []);

	const one = await executeNexo({ resource: 'maps', operation: 'get', identifier: MAPS_JOB }, jobs[0]);
	assert.equal(one.request.url, `api/v1/jobs/${MAPS_JOB}`);
	assert.deepEqual(one.output[0][0].json, jobs[0]);
	await assert.rejects(executeNexo({ resource: 'maps', operation: 'get', identifier: ' ' }, {}), /ID da busca/);
});

test('Maps results parse the CSV into one item per company, with a normalized phone', async () => {
	const csv = '﻿title,category,address,phone,website,emails\r\n'
		+ 'Tavares Contabilidade,Escritório de contabilidade,"R. Exemplo, 389 - Santa Cecília",(11) 3361-8832,https://t.example,\r\n'
		+ '"Contador ""Zé""",Contador,"Linha 1\nLinha 2",+55 11 97155-5292,,a@b.com\r\n'
		+ 'Sem telefone,Contador,Rua B,,,\r\n';
	const { output, request } = await executeNexo({ resource: 'maps', operation: 'results', identifier: MAPS_JOB }, csv);
	assert.equal(request.url, `api/v1/jobs/${MAPS_JOB}/download`);
	assert.equal(request.headers.Accept, 'text/csv');
	assert.equal(request.json, false);
	const rows = output[0].map((item) => item.json);
	assert.equal(rows.length, 3);
	assert.deepEqual(rows[0], { title: 'Tavares Contabilidade', category: 'Escritório de contabilidade', address: 'R. Exemplo, 389 - Santa Cecília', phone: '(11) 3361-8832', website: 'https://t.example', emails: '', phone_e164: '+551133618832' });
	assert.equal(rows[1].title, 'Contador "Zé"');
	assert.equal(rows[1].address, 'Linha 1\nLinha 2');
	assert.equal(rows[1].phone_e164, '+5511971555292');
	assert.equal(rows[2].phone_e164, null);
	assert.deepEqual((await executeNexo({ resource: 'maps', operation: 'results', identifier: MAPS_JOB }, 'title,phone\n')).output[0], []);
	assert.deepEqual((await executeNexo({ resource: 'maps', operation: 'results', identifier: MAPS_JOB }, '')).output[0], []);
});

test('Maps delete removes the search and answers with a confirmation, even with an empty body', async () => {
	const { output, request } = await executeNexo({ resource: 'maps', operation: 'delete', identifier: MAPS_JOB }, '');
	assert.equal(request.method, 'DELETE');
	assert.equal(request.url, `api/v1/jobs/${MAPS_JOB}`);
	assert.deepEqual(output[0], [{ json: { id: MAPS_JOB, deleted: true }, pairedItem: { item: 0 } }]);
});

test('existing resources still use the Nexo API base URL', async () => {
	const { request } = await executeNexo({ resource: 'dashboard', operation: 'get' }, {});
	assert.equal(request.baseURL, 'https://nexo.test/');
});

test('client sales channel is optional on create and filterable', async () => {
	const withChannel = await executeNexo({ resource: 'clients', operation: 'create', name: 'Escritório X', niche: 'Contabilidade', salesChannel: 'email' }, { id: 'c1' });
	assert.equal(withChannel.request.body.sales_channel, 'email');
	const without = await executeNexo({ resource: 'clients', operation: 'create', name: 'Escritório Y', niche: 'Contabilidade', salesChannel: '' }, { id: 'c2' });
	assert.equal(Object.hasOwn(without.request.body, 'sales_channel'), false);

	const filtered = await executeNexo({ resource: 'clients', operation: 'getMany', filterSalesChannel: 'whatsapp', pipelineStage: 'lead', limit: 5, offset: 0 }, []);
	assert.equal(filtered.request.qs.sales_channel, 'whatsapp');
	assert.equal(filtered.request.qs.pipeline_stage, 'lead');
	const unfiltered = await executeNexo({ resource: 'clients', operation: 'getMany', filterSalesChannel: '', limit: 5, offset: 0 }, []);
	assert.equal(Object.hasOwn(unfiltered.request.qs, 'sales_channel'), false);
});

test('client update can set, keep or remove the sales channel', async () => {
	const base = { resource: 'clients', operation: 'update', updateLookupBy: 'id', updateLookupValue: 'client-1', notes: 'x' };
	assert.equal((await executeNexo({ ...base, salesChannel: 'instagram' }, { id: 'client-1' })).request.body.sales_channel, 'instagram');
	assert.equal(Object.hasOwn((await executeNexo({ ...base, salesChannel: '' }, { id: 'client-1' })).request.body, 'sales_channel'), false);
	const cleared = await executeNexo({ ...base, salesChannel: '__clear' }, { id: 'client-1' });
	assert.equal(Object.hasOwn(cleared.request.body, 'sales_channel'), true);
	assert.equal(cleared.request.body.sales_channel, null);
});

test('sales channel options match the API values, with a way to leave it empty', () => {
	const fields = new Nexo().description.properties.filter((field) => field.name === 'salesChannel');
	const api = ['email', 'whatsapp', 'instagram', 'phone', 'in_person', 'other'];
	assert.equal(fields.length, 2);
	for (const field of fields) {
		assert.equal(field.type, 'options');
		assert.equal(field.options[0].value, '');
		assert.deepEqual(field.options.map((option) => option.value).filter((value) => api.includes(value)), api);
	}
	const filter = new Nexo().description.properties.find((field) => field.name === 'filterSalesChannel');
	assert.deepEqual(filter.options.map((option) => option.value), ['', ...api]);
});
