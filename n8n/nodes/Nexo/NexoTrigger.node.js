const DEFAULT_BASE_URL = 'https://nexo-production-60a0.up.railway.app';

const eventOptions = [
	{ name: 'Qualquer evento', value: 'any' },
	{ name: 'Novo aviso da equipe', value: 'teamAnnouncement' },
	{ name: 'Novo cliente cadastrado', value: 'newClient' },
	{ name: 'Nova automação cadastrada', value: 'newAutomation' },
	{ name: 'Contrato fechado', value: 'closedContract' },
	{ name: 'Novo membro', value: 'memberJoined' },
	{ name: 'Nova mensagem no chat', value: 'chatMessage' },
	{ name: 'Solicitação de automação', value: 'automation' },
];

function formatTriggerItem(payload) {
	const data = payload && Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;
	return { json: data && typeof data === 'object' ? data : { value: data } };
}

class NexoTrigger {
	constructor() {
		this.description = {
			displayName: 'Nexo Trigger',
			name: 'nexoTrigger',
			icon: 'file:nexo-mark.svg',
			group: ['trigger'],
			version: 2,
			description: 'Espera um evento real da Nexo e inicia o workflow com os dados desse evento.',
			defaults: { name: 'Nexo Trigger' },
			inputs: [],
			outputs: ['main'],
			credentials: [{ name: 'nexoApi', required: true }],
			webhooks: [{ name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'nexo-event' }],
			properties: [{
				displayName: 'Iniciar quando', name: 'event', type: 'options', options: eventOptions,
				default: 'any', required: true,
			}],
		};

		this.webhookMethods = {
			default: {
				checkExists: async function () {
					return Boolean(this.getWorkflowStaticData('node').subscriptionId);
				},
				create: async function () {
					const staticData = this.getWorkflowStaticData('node');
					const event = this.getNodeParameter('event', 'any');
					const subscription = await this.helpers.httpRequestWithAuthentication.call(this, 'nexoApi', {
						method: 'POST', baseURL: `${DEFAULT_BASE_URL}/`, url: 'event-subscriptions',
						body: { event, webhook_url: this.getNodeWebhookUrl('default') }, json: true, timeout: 30000,
					});
					staticData.subscriptionId = subscription.id;
					return true;
				},
				delete: async function () {
					const staticData = this.getWorkflowStaticData('node');
					if (!staticData.subscriptionId) return true;
					try {
						await this.helpers.httpRequestWithAuthentication.call(this, 'nexoApi', {
							method: 'DELETE', baseURL: `${DEFAULT_BASE_URL}/`,
							url: `event-subscriptions/${encodeURIComponent(staticData.subscriptionId)}`,
							json: true, timeout: 30000,
						});
					} finally {
						delete staticData.subscriptionId;
					}
					return true;
				},
			},
		};
	}

	async webhook() {
		return { workflowData: [[formatTriggerItem(this.getBodyData())]] };
	}
}

module.exports = { NexoTrigger, formatTriggerItem };
