import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tokenConfigDirectory } from './TokenConfig.js'
import type { ChatMessage } from '../components/chat/types.js'

export const sessionTranscriptDirectory = path.join(tokenConfigDirectory, 'sessions')

const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/

function assertValidSessionId(sessionId: string): void {
	if (!SESSION_ID_PATTERN.test(sessionId)) {
		throw new Error(`Invalid session id: ${sessionId}`)
	}
}

function transcriptPath(sessionId: string): string {
	assertValidSessionId(sessionId)
	return path.join(sessionTranscriptDirectory, `${sessionId}.json`)
}

function isPersistableMessage(message: unknown): message is ChatMessage {
	if (typeof message !== 'object' || message === null) return false

	const candidate = message as { id?: unknown; role?: unknown; content?: unknown }
	return (
		typeof candidate.id === 'string' &&
		typeof candidate.role === 'string' &&
		(candidate.role === 'user' ||
			candidate.role === 'thinking' ||
			candidate.role === 'assistant' ||
			candidate.role === 'console') &&
		typeof candidate.content === 'string'
	)
}

export async function loadSessionTranscript(sessionId: string): Promise<ChatMessage[]> {
	assertValidSessionId(sessionId)

	try {
		const content = await readFile(transcriptPath(sessionId), 'utf8')
		const parsed: unknown = JSON.parse(content)

		if (!Array.isArray(parsed)) return []
		return parsed.filter(isPersistableMessage)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
		throw error
	}
}

export async function saveSessionTranscript(sessionId: string, messages: ChatMessage[]): Promise<void> {
	assertValidSessionId(sessionId)

	if (messages.length === 0) {
		await deleteSessionTranscript(sessionId)
		return
	}

	const persistable = messages.filter(isPersistableMessage)
	if (persistable.length === 0) {
		await deleteSessionTranscript(sessionId)
		return
	}

	await mkdir(sessionTranscriptDirectory, { recursive: true, mode: 0o700 })
	await writeFile(transcriptPath(sessionId), JSON.stringify(persistable, null, 2), { mode: 0o600 })
}

export async function deleteSessionTranscript(sessionId: string): Promise<void> {
	assertValidSessionId(sessionId)
	await rm(transcriptPath(sessionId), { force: true })
}
