const DEFAULT_BASE_URL = 'https://nexo-production-60a0.up.railway.app';

const eventOptions = [
	{ name: 'Qualquer nova notificação', value: 'any' },
	{ name: 'Novo aviso da equipe', value: 'teamAnnouncement' },
	{ name: 'Novo cliente cadastrado', value: 'newClient' },
	{ name: 'Contrato fechado', value: 'closedContract' },
	{ name: 'Novo membro', value: 'memberJoined' },
	{ name: 'Nova mensagem no chat', value: 'chatMessage' },
	{ name: 'Evento de automação', value: 'automation' },
];

function matchesEvent(note, event) {
	const title = String(note.title || '').trim().toLocaleLowerCase('pt-BR');
	switch (event) {
		case 'teamAnnouncement':
			return note.kind === 'announcement'
				&& title !== 'novo cliente cadastrado'
				&& title !== 'contrato fechado';
		case 'newClient':
			return note.kind === 'announcement' && title === 'novo cliente cadastrado';
		case 'closedContract':
			return note.kind === 'announcement' && title === 'contrato fechado';
		case 'memberJoined': return note.kind === 'member_joined';
		case 'chatMessage': return note.kind === 'chat_message';
		case 'automation':
			return ['automation_request', 'automation_invitation', 'automation_rejected'].includes(note.kind);
		default: return true;
	}
}

function formatTriggerItem(note, event) {
	return { json: { ...note } };
}

class NexoTrigger {
	constructor() {
		this.description = {
			displayName: 'Nexo Trigger',
			name: 'nexoTrigger',
			icon: 'file:nexo-mark.svg',
			group: ['trigger'],
			version: 1,
			description: 'Inicia um workflow quando uma nova notificação aparece na Nexo.',
			defaults: { name: 'Nexo Trigger' },
			polling: true,
			inputs: [],
			outputs: ['main'],
			credentials: [{ name: 'nexoApi', required: true }],
			properties: [
				{
					displayName: 'Iniciar quando',
					name: 'event',
					type: 'options',
					options: eventOptions,
					default: 'any',
					required: true,
				},
			],
		};
	}

	async poll() {
		const staticData = this.getWorkflowStaticData('node');
		const credentials = await this.getCredentials('nexoApi');
		const baseUrl = String(credentials.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
		const event = this.getNodeParameter('event', 'any');
		const notifications = await this.helpers.httpRequestWithAuthentication.call(this, 'nexoApi', {
			method: 'GET',
			baseURL: `${baseUrl}/`,
			url: 'notifications',
			qs: { limit: 100, offset: 0 },
			json: true,
			timeout: 30000,
		});
		const rows = Array.isArray(notifications) ? notifications : [];
		const ids = rows.map((note) => String(note.id || note.identifier || '')).filter(Boolean);

		// The first poll establishes a baseline so activating the workflow does not
		// replay the account's entire notification history.
		if (!staticData.initialized) {
			staticData.initialized = true;
			staticData.seenIds = ids.slice(0, 500);
			if (this.getMode() === 'manual') {
				const sample = rows.filter((note) => matchesEvent(note, event)).slice(0, 1);
				return sample.length ? [sample.map((note) => formatTriggerItem(note, event))] : null;
			}
			return null;
		}

		const seen = new Set(staticData.seenIds || []);
		const fresh = rows
			.filter((note) => {
				const id = String(note.id || note.identifier || '');
				return id && !seen.has(id) && matchesEvent(note, event);
			})
			.sort((a, b) => Date.parse(a.created_at || 0) - Date.parse(b.created_at || 0));

		staticData.seenIds = [...new Set([...ids, ...(staticData.seenIds || [])])].slice(0, 500);
		if (!fresh.length) return null;
		return [fresh.map((note) => formatTriggerItem(note, event))];
	}
}

module.exports = { NexoTrigger, formatTriggerItem };
