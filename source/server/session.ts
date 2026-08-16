import { type ChatStreamChunk } from '../../core-lib/index.js'
import { getAIResponse } from '../actions/agent.js'
import { chatSessionExists, getCurrentSessionId, resetChatSession, setCurrentSessionId } from '../core/apiClient.js'
import { ServerSystemPrompt } from '../prompts/index.js'
import { type FunctionTool } from './types.js'

let completionQueue: Promise<void> = Promise.resolve()
let initializedSessionToken: string | undefined
const sessionTools = new Map<string, FunctionTool[]>()

export function getSessionTools(sessionId: string | undefined): FunctionTool[] | undefined {
	return sessionId ? sessionTools.get(sessionId) : undefined
}

export function rememberSessionTools(sessionId: string | undefined, tools: FunctionTool[]): void {
	if (sessionId) sessionTools.set(sessionId, tools)
}

export function enqueueCompletion<T>(task: () => Promise<T>): Promise<T> {
	const run = completionQueue.then(task, task)
	completionQueue = run.then(
		() => undefined,
		() => undefined
	)
	return run
}

export async function runCompletion(options: {
	token: string
	sessionId?: string
	prompt: string
	thinkingEnabled: boolean
	searchEnabled: boolean
	onChunk?: (chunk: ChatStreamChunk) => void
	shouldAbort: () => boolean
}) {
	if (options.shouldAbort()) return { stopped: true, ok: true, sessionId: '', content: '', thinkingContent: '' }

	if (initializedSessionToken !== undefined && initializedSessionToken !== options.token) {
		resetChatSession()
		initializedSessionToken = undefined
	}

	if (options.sessionId) {
		const sessionExists = await chatSessionExists(options.token, options.sessionId)
		if (getCurrentSessionId() !== options.sessionId) setCurrentSessionId(options.sessionId)
		initializedSessionToken = sessionExists ? options.token : undefined
	}

	if (initializedSessionToken !== options.token) {
		await getAIResponse({
			token: options.token,
			prompt: ServerSystemPrompt(),
			thinkingEnabled: options.thinkingEnabled,
			searchEnabled: false,
			toolsEnabled: false,
		})
		initializedSessionToken = options.token
	}

	if (options.shouldAbort()) return { stopped: true, ok: true, sessionId: '', content: '', thinkingContent: '' }

	return getAIResponse({
		token: options.token,
		prompt: options.prompt,
		thinkingEnabled: options.thinkingEnabled,
		searchEnabled: options.searchEnabled,
		onChunk: options.onChunk,
		toolsEnabled: false,
	})
}
