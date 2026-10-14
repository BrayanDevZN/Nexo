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
