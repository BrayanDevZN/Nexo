const test = require('node:test');
const assert = require('node:assert/strict');
const { NexoTrigger, eventOptions } = require('../nodes/Nexo/NexoTrigger.node');

test('trigger registers an event subscription when the workflow is activated', async () => {
	let request;
	const staticData = {};
	const context = {
		getWorkflowStaticData: () => staticData,
		getCredentials: async () => ({ baseUrl: 'https://nexo.test' }),
		getNodeParameter: () => 'newClient',
		getWebhookUrl: () => 'https://n8n.example/webhook/nexo-event',
		helpers: { httpRequestWithAuthentication: async function (_credential, options) {
			request = options;
			return { id: 'subscription-1' };
		} },
	};
	const methods = new NexoTrigger().description.webhookMethods.default;
	assert.equal(await methods.create.call(context), true);
	assert.equal(request.method, 'POST');
	assert.equal(request.url, 'event-subscriptions');
	assert.deepEqual(request.body, {
		event: 'newClient',
		webhook_url: 'https://n8n.example/webhook/nexo-event',
	});
	assert.equal(staticData.subscriptionId, 'subscription-1');
});

test('trigger removes its event subscription when the workflow is deactivated', async () => {
	let request;
	const staticData = { subscriptionId: 'subscription/1' };
	const context = {
		getWorkflowStaticData: () => staticData,
		getCredentials: async () => ({ baseUrl: 'https://nexo.test' }),
		helpers: { httpRequestWithAuthentication: async function (_credential, options) {
			request = options;
			return {};
		} },
	};
	const methods = new NexoTrigger().description.webhookMethods.default;
	assert.equal(await methods.delete.call(context), true);
	assert.equal(request.method, 'DELETE');
	assert.equal(request.url, 'event-subscriptions/subscription%2F1');
	assert.equal(staticData.subscriptionId, undefined);
});

test('trigger outputs the event data directly as JSON', async () => {
	const data = { id: 'client-1', name: 'Empresa Exemplo', niche: 'Varejo' };
	const context = { getRequestObject: () => ({ body: { event: 'newClient', data } }) };
	assert.deepEqual(await NexoTrigger.prototype.webhook.call(context), {
		workflowData: [[{ json: data }]],
	});
});

test('trigger rejects payloads without event data', async () => {
	const context = { getRequestObject: () => ({ body: { event: 'newClient' } }) };
	await assert.rejects(NexoTrigger.prototype.webhook.call(context), /campo data ausente/);
});

test('trigger offers only Nexo-supported event filters', () => {
	const node = new NexoTrigger();
	assert.equal(node.description.polling, undefined);
	assert.equal(node.description.webhooks[0].httpMethod, 'POST');
	assert.deepEqual(node.description.properties[0].options, eventOptions);
	assert.deepEqual(eventOptions.map(({ value }) => value), [
		'any', 'teamAnnouncement', 'newClient', 'newAutomation',
		'closedContract', 'memberJoined', 'chatMessage', 'automation',
	]);
});
