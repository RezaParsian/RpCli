import type { ChatMode } from '../../actions/agent.js'

export type SubmitOptions = {
	addToHistory?: boolean
	reloadAgentsAfter?: boolean
	executeApprovedPlan?: boolean
	modeOverride?: ChatMode
}

export type ChatMessage = {
	id: string
	role: 'logo' | 'user' | 'thinking' | 'assistant' | 'console'
	content: string
}

export function loadingSpinnerText(streamingMessages: ChatMessage[]): string {
	const role = streamingMessages[streamingMessages.length - 1]?.role

	if (role === 'assistant') return 'Writing... Esc to stop'
	if (role === 'console') return 'Running tools... Esc to stop'

	return 'Thinking... Esc to stop'
}
