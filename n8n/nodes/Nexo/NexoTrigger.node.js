const DEFAULT_BASE_URL = 'https://nexo-production-60a0.up.railway.app';

const eventOptions = [
	{ name: 'Qualquer novo evento', value: 'any' },
	{ name: 'Novo aviso da equipe', value: 'teamAnnouncement' },
	{ name: 'Novo cliente cadastrado', value: 'newClient' },
	{ name: 'Nova automação cadastrada', value: 'newAutomation' },
	{ name: 'Contrato fechado', value: 'closedContract' },
	{ name: 'Novo membro', value: 'memberJoined' },
	{ name: 'Nova mensagem no chat', value: 'chatMessage' },
	{ name: 'Solicitação de automação', value: 'automation' },
];

class NexoTrigger {
	constructor() {
		this.description = {
			displayName: 'Nexo Trigger',
			name: 'nexoTrigger',
			icon: 'file:nexo-mark.svg',
			group: ['trigger'],
			version: 1,
			description: 'Inicia o workflow imediatamente quando a Nexo envia o evento selecionado.',
			defaults: { name: 'Nexo Trigger' },
			inputs: [],
			outputs: ['main'],
			webhooks: [{ name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'nexo-event' }],
			webhookMethods: {
				default: {
					async create() {
						const staticData = this.getWorkflowStaticData('node');
						if (staticData.subscriptionId) return true;
						const credentials = await this.getCredentials('nexoApi');
						const baseUrl = String(credentials.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
						const response = await this.helpers.httpRequestWithAuthentication.call(this, 'nexoApi', {
							method: 'POST', baseURL: `${baseUrl}/`, url: 'event-subscriptions',
							body: { event: this.getNodeParameter('event', 'any'), webhook_url: this.getWebhookUrl('default') },
							json: true, timeout: 30000,
						});
					if (!response?.id) throw new Error('A Nexo não retornou o ID da assinatura de evento.');
					staticData.subscriptionId = response.id;
					return true;
				},
					async delete() {
						const staticData = this.getWorkflowStaticData('node');
						if (!staticData.subscriptionId) return true;
					const credentials = await this.getCredentials('nexoApi');
					const baseUrl = String(credentials.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
					await this.helpers.httpRequestWithAuthentication.call(this, 'nexoApi', {
						method: 'DELETE', baseURL: `${baseUrl}/`,
						url: `event-subscriptions/${encodeURIComponent(staticData.subscriptionId)}`,
						json: false, timeout: 30000,
					});
					delete staticData.subscriptionId;
					return true;
				},
				},
			},
			credentials: [{ name: 'nexoApi', required: true }],
			properties: [{
				displayName: 'Iniciar quando',
				name: 'event',
				type: 'options',
				options: eventOptions,
				default: 'any',
				required: true,
			}],
		};
	}

	async webhook() {
		const body = this.getRequestObject()?.body;
		if (!body || typeof body !== 'object' || !body.data || typeof body.data !== 'object') {
			throw new Error('Payload de evento da Nexo inválido: campo data ausente.');
		}
		return { workflowData: [[{ json: body.data }]] };
	}
}

module.exports = { NexoTrigger, eventOptions };
