import { SlashCommand } from './index.js'
import { startServer } from '../server/index.js'

export const serveCommand: SlashCommand = {
	name: '/serve',
	aliases: ['/server'],
	description: 'Start an OpenAI-compatible HTTP API',
	execute: async () => {
		try {
			console.log('Starting HTTP server...')
			await startServer()
		} catch (error: unknown) {
			console.error('Failed to start server:', error instanceof Error ? error.message : error)
		}
	},
}