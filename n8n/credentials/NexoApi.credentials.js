class NexoApi {
	constructor() {
		this.name = 'nexoApi';
		this.displayName = 'Nexo API';
		this.documentationUrl = 'https://nexoaicompany.com';
		this.properties = [
			{
				displayName: 'Base URL',
				name: 'baseUrl',
				type: 'string',
				default: 'https://nexo-production-60a0.up.railway.app',
				required: true,
				description: 'URL base da API da Nexo, sem barra no final.',
			},
			{
				displayName: 'API Key',
				name: 'apiKey',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				required: true,
				description: 'Chave criada na seção API da Nexo.',
			},
		];
		this.authenticate = {
			type: 'generic',
			properties: {
				headers: {
					Authorization: '=Bearer {{$credentials.apiKey}}',
				},
			},
		};
		this.test = {
			request: {
				baseURL: '={{$credentials.baseUrl}}',
				url: '/dashboard',
			},
		};
	}
}

module.exports = { NexoApi };
