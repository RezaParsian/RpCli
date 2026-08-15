import { SlashCommand } from './index.js'
import { startServer } from '../server/index.js'

export const serveCommand: SlashCommand = {
  name: '/serve',
  aliases: ['/server'],
  description: 'Start HTTP server with OpenAI-compatible API',
  execute: async () => {
    try {
      console.log('Starting HTTP server...')
      await startServer()
    } catch (error: any) {
      console.error('Failed to start server:', error.message)
    }
  },
}