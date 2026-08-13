import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chatLoggingEnvName, saveChatLoggingPreference, tokenConfigDirectory } from './TokenConfig.js'

export const chatLogDirectory = path.join(tokenConfigDirectory, 'logs')

function envFlag(name: string): boolean {
	const value = process.env[name]?.trim().toLowerCase()
	return value === '1' || value === 'true' || value === 'yes'
}

let loggingEnabled = envFlag(chatLoggingEnvName)

export function isChatLoggingEnabled(): boolean {
	return loggingEnabled
}

export async function setChatLoggingEnabled(enabled: boolean): Promise<void> {
	loggingEnabled = enabled
	process.env[chatLoggingEnvName] = enabled ? '1' : ''
	await saveChatLoggingPreference(enabled)
}

export default function logChat(logData: { [key: string]: unknown; sessionId: string }): void {
	if (!isChatLoggingEnabled()) return

	void writeChatLog(logData)
}

async function writeChatLog(logData: { [key: string]: unknown; sessionId: string }): Promise<void> {
	try {
		const logDir = path.join(chatLogDirectory, logData.sessionId)
		await mkdir(logDir, { recursive: true, mode: 0o700 })
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
		const logFile = path.join(logDir, `chat_${timestamp}.json`)
		await writeFile(logFile, JSON.stringify(logData, null, 2), { mode: 0o600 })
	} catch {
		// Logging must never interrupt chat.
	}
}
