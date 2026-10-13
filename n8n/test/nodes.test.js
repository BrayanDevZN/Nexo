const test = require('node:test');
const assert = require('node:assert/strict');

const { Nexo } = require('../nodes/Nexo/Nexo.node');
const { formatTriggerItem } = require('../nodes/Nexo/NexoTrigger.node');

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
	for (const resource of ['clients', 'automations', 'documents', 'notifications']) {
		const operations = node.methods.loadOptions.getOperations.call({ getCurrentNodeParameter: () => resource });
		assert.ok(operations.some((operation) => operation.value === 'getMany' && operation.name === 'Get Many'));
		assert.ok(operations.some((operation) => operation.value === 'get' && operation.name === 'Get'));
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

test('trigger returns the notification as a direct JSON item', () => {
	const note = { id: 'n1', kind: 'announcement', title: 'Contrato fechado', created_at: '2026-10-13T12:00:00Z' };
	assert.deepEqual(formatTriggerItem(note, 'closedContract').json, note);
});
