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
					const url = this.getNodeWebhookUrl('default');
					const event = this.getNodeParameter('event', 'any');
					const subscriptions = this.getWorkflowStaticData('node').subscriptions || {};
					const current = subscriptions[url];
					if (!current || current.event !== event) return false;
					const credentials = await this.getCredentials('nexoApi');
					try {
						const remote = await this.helpers.httpRequestWithAuthentication.call(this, 'nexoApi', {
							method: 'GET', baseURL: `${credentials.baseUrl || DEFAULT_BASE_URL}/`,
							url: `event-subscriptions/${encodeURIComponent(current.id)}`,
							json: true, timeout: 30000,
						});
						return remote.id === current.id && remote.event === event && remote.url === url;
					} catch (error) {
						if (error.statusCode === 404 || error.response?.statusCode === 404) return false;
						throw error;
					}
				},
				create: async function () {
					const staticData = this.getWorkflowStaticData('node');
					const event = this.getNodeParameter('event', 'any');
					const url = this.getNodeWebhookUrl('default');
					const credentials = await this.getCredentials('nexoApi');
					const baseURL = `${credentials.baseUrl || DEFAULT_BASE_URL}/`;
					const previous = staticData.subscriptions && staticData.subscriptions[url];
					const subscription = await this.helpers.httpRequestWithAuthentication.call(this, 'nexoApi', {
						method: 'POST', baseURL, url: 'event-subscriptions',
						body: { event, webhook_url: url }, json: true, timeout: 30000,
					});
					if (!staticData.subscriptions) staticData.subscriptions = {};
					staticData.subscriptions[url] = { id: subscription.id, event };
					if (previous && previous.id !== subscription.id) {
						try {
							await this.helpers.httpRequestWithAuthentication.call(this, 'nexoApi', {
								method: 'DELETE', baseURL,
								url: `event-subscriptions/${encodeURIComponent(previous.id)}`,
								json: true, timeout: 30000,
							});
						} catch (error) {
							if (error.statusCode !== 404 && error.response?.statusCode !== 404) throw error;
						}
					}
					return true;
				},
				delete: async function () {
					const staticData = this.getWorkflowStaticData('node');
					const url = this.getNodeWebhookUrl('default');
					const current = staticData.subscriptions && staticData.subscriptions[url];
					if (!current) return true;
					const credentials = await this.getCredentials('nexoApi');
					try {
						await this.helpers.httpRequestWithAuthentication.call(this, 'nexoApi', {
							method: 'DELETE', baseURL: `${credentials.baseUrl || DEFAULT_BASE_URL}/`,
							url: `event-subscriptions/${encodeURIComponent(current.id)}`,
							json: true, timeout: 30000,
						});
					} catch (error) {
						if (error.statusCode !== 404 && error.response?.statusCode !== 404) throw error;
					} finally {
						delete staticData.subscriptions[url];
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
