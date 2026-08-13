import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export const tokenConfigDirectory = path.join(os.homedir(), '.config', 'rp-cli')

export const tokenConfigPath = path.join(tokenConfigDirectory, '.env')

export const chatLoggingEnvName = 'RP_CLI_LOG_CHAT'

async function readConfigEntries(): Promise<Map<string, string>> {
	const entries = new Map<string, string>()

	try {
		const content = await readFile(tokenConfigPath, 'utf8')

		for (const line of content.split(/\r?\n/)) {
			const trimmed = line.trim()
			if (!trimmed || trimmed.startsWith('#')) continue

			const separator = trimmed.indexOf('=')
			if (separator <= 0) continue

			const key = trimmed.slice(0, separator)
			let value = trimmed.slice(separator + 1)

			if (
				(value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))
			) {
				try {
					value = JSON.parse(value) as string
				} catch {
					value = value.slice(1, -1)
				}
			}

			entries.set(key, value)
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
	}

	return entries
}

async function writeConfigEntries(entries: Map<string, string>): Promise<void> {
	if (entries.size === 0) {
		await rm(tokenConfigPath, { force: true })
		return
	}

	await mkdir(tokenConfigDirectory, { recursive: true, mode: 0o700 })
	const body = [...entries.entries()].map(([key, value]) => `${key}=${JSON.stringify(value)}\n`).join('')
	await writeFile(tokenConfigPath, body, { mode: 0o600 })
}

export async function saveDeepSeekToken(token: string): Promise<void> {
	const entries = await readConfigEntries()
	entries.set('DEEPSEEK_TOKEN', token)
	await writeConfigEntries(entries)
}

export async function clearDeepSeekToken(): Promise<void> {
	const entries = await readConfigEntries()
	entries.delete('DEEPSEEK_TOKEN')
	await writeConfigEntries(entries)
}

export async function saveChatLoggingPreference(enabled: boolean): Promise<void> {
	const entries = await readConfigEntries()

	if (enabled) {
		entries.set(chatLoggingEnvName, '1')
	} else {
		entries.delete(chatLoggingEnvName)
	}

	await writeConfigEntries(entries)
}
