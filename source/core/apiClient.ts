// @ts-ignore
import PowSolver from '@rezaparsian/deepseek-pow-solver'
import {
	chat,
	chatSessions,
	createPowChallenge,
	createSessions,
	stopStream,
	type ChatResult,
	type ChatStreamChunk,
} from '../../core-lib/index.js'
import logFn from './LogChat.js'

let sessionId = process.env['DEEPSEEK_SESSION_ID']
let parentMessageId: number | null = process.env['DEEPSEEK_MESSAGE_ID'] ? Number(process.env['DEEPSEEK_MESSAGE_ID']) : null
let generationAbort: AbortController | null = null
let lastStreamMessageId: number | null = null

const EMPTY_RESPONSE_PROMPT =
	'Your previous message contained only thinking and no visible response. Please provide the final answer now.'
const MAX_EMPTY_RESPONSE_RETRIES = 2

export function beginGeneration(): AbortSignal {
	generationAbort = new AbortController()
	lastStreamMessageId = null
	return generationAbort.signal
}

export function isGenerationStopped(): boolean {
	return generationAbort?.signal.aborted ?? false
}

export async function stopCurrentGeneration(token: string): Promise<void> {
	const messageId = lastStreamMessageId
	const currentSessionId = sessionId
	generationAbort?.abort()

	if (currentSessionId && typeof messageId === 'number') {
		await stopStream({ token, sessionId: currentSessionId, messageId }).catch(() => undefined)
	}
}

export function resetChatSession(): void {
	sessionId = undefined
	parentMessageId = null
	generationAbort = null
	lastStreamMessageId = null
}

export default async function sendMessage(
	token: string,
	prompt: string,
	thinkingEnabled = true,
	onChunk?: (chunk: ChatStreamChunk) => void,
	searchEnabled = false,
	emptyResponseRetryCount = 0
): Promise<ChatResult> {
	if (generationAbort?.signal.aborted) {
		return {
			ok: true,
			sessionId: sessionId ?? '',
			content: '',
			thinkingContent: '',
			messageId: parentMessageId,
			finished: true,
			stopped: true,
		}
	}

	if (parentMessageId === null) {
		const sessions = await chatSessions(token)
		const sessionDetail = sessions.find((session) => session.id === sessionId)

		if (!sessionDetail) {
			parentMessageId = null
			sessionId = await createSessions(token)
		} else {
			parentMessageId = sessionDetail.current_message_id
		}
	}

	if (!sessionId) throw new Error('sessionId is missing')

	const solver = new PowSolver()
	solver.init()

	const pow = await createPowChallenge(token)

	const payload = solver.solve(pow)
	const challenge = btoa(JSON.stringify(payload))

	if (generationAbort?.signal.aborted) {
		return {
			ok: true,
			sessionId,
			content: '',
			thinkingContent: '',
			messageId: parentMessageId,
			finished: true,
			stopped: true,
		}
	}

	const res = await chat({
		token,
		challenge,
		sessionId,
		parentMessageId,
		prompt,
		thinking_enabled: thinkingEnabled,
		search_enabled: searchEnabled,
		signal: generationAbort?.signal,
		onChunk: (chunk) => {
			if (chunk.messageId != null) {
				lastStreamMessageId = chunk.messageId
			}

			onChunk?.(chunk)
		},
		logFn,
	})

	if (!res.ok) {
		throw new Error(res.error)
	} else {
		parentMessageId = res.messageId || parentMessageId

		if (res.stopped) {
			return res
		}

		if (!res.content?.trim() && res.thinkingContent?.trim() && emptyResponseRetryCount < MAX_EMPTY_RESPONSE_RETRIES) {
			return sendMessage(token, EMPTY_RESPONSE_PROMPT, thinkingEnabled, onChunk, searchEnabled, emptyResponseRetryCount + 1)
		}

		return res
	}
}
