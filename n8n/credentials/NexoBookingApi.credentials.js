class NexoBookingApi {
	constructor() {
		this.name = 'nexoBookingApi';
		this.displayName = 'Nexo Atendimentos API';
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
				description: 'Chave criada em Atendimentos > Conta > Chave de API (começa com nexo_book_).',
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
				url: '/atendimentos/businesses',
			},
		};
	}
}

module.exports = { NexoBookingApi };
