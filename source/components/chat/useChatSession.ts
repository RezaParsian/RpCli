import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react'
import { getChatSystemPrompt, getAIResponse } from '../../actions/agent.js'
import { getCurrentSessionId, resetChatSession } from '../../core/apiClient.js'
import { deleteSession, isInvalidTokenError } from '../../../core-lib/index.js'
import type { ChatMessage } from './types.js'

type Options = {
	token: string
	onInvalidToken: () => void
	setMessages: Dispatch<SetStateAction<ChatMessage[]>>
}

export function useChatSession({ token, onInvalidToken, setMessages }: Options) {
	const sessionId = useRef<string | undefined>(undefined)
	const initialization = useRef<Promise<void> | undefined>(undefined)
	const initializationSucceeded = useRef(false)
	const hasUserMessage = useRef(false)
	const unmounted = useRef(false)
	const sessionDeleted = useRef(false)
	const stopRequested = useRef(false)
	const sessionGeneration = useRef(0)

	const deleteUnusedSession = useCallback(async () => {
		if (hasUserMessage.current || sessionDeleted.current) return

		const id = sessionId.current ?? getCurrentSessionId()
		if (!id) return

		sessionDeleted.current = true
		await deleteSession(token, id).catch(() => undefined)
	}, [token])

	const startSession = useCallback((modelType: 'default' | 'expert' = 'default', prompt = getChatSystemPrompt()) => {
		const generation = ++sessionGeneration.current
		initializationSucceeded.current = false
		initialization.current = (async () => {
			try {
				const response = await getAIResponse({
					token,
					prompt,
					modelType,
				})

				if (generation !== sessionGeneration.current) {
					if (response.sessionId) {
						void deleteSession(token, response.sessionId).catch(() => undefined)
					}
					return
				}

				sessionId.current = response.sessionId
				initializationSucceeded.current = true

				if (unmounted.current) {
					void deleteUnusedSession()
				}
			} catch (error) {
				if (generation !== sessionGeneration.current) return

				if (isInvalidTokenError(error)) {
					onInvalidToken()
					return
				}

				if (!unmounted.current) {
					setMessages((previous) => [
						...previous,
						{
							id: `err-${Date.now()}`,
							role: 'assistant',
							content: `Error: ${error instanceof Error ? error.message : String(error)}`,
						},
					])
				}
			}
		})()
	}, [deleteUnusedSession, onInvalidToken, setMessages, token])

	const switchModel = useCallback(async (fromModel: 'default' | 'expert', toModel: 'default' | 'expert') => {
		// The initialization request only loads the system prompt. Until the user
		// sends a message, the same session can safely use either model. Keeping it
		// also avoids racing a new session against deletion of the initializing one.
		if (!hasUserMessage.current) return

		let summary = ''
		if (initializationSucceeded.current) {
			const response = await getAIResponse({
				token,
				prompt: "Summarize the conversation so far for another model. Preserve the user's goals, decisions, constraints, relevant files, and unfinished work. Return only a concise factual summary.",
				modelType: fromModel,
				thinkingEnabled: false,
				toolsEnabled: false,
			})
			summary = response.content?.trim() ?? ''
		}

		sessionDeleted.current = false
		hasUserMessage.current = false
		sessionId.current = undefined
		resetChatSession()
		const initialPrompt = summary
			? getChatSystemPrompt() + '\n\nConversation summary from the previous session:\n\n' + summary
			: getChatSystemPrompt()
		startSession(toModel, initialPrompt)
		await initialization.current

	}, [startSession, token])

	const resetConversation = useCallback((modelType: 'default' | 'expert' = 'default') => {
		void deleteUnusedSession()
		sessionDeleted.current = false
		hasUserMessage.current = false
		sessionId.current = undefined
		resetChatSession()
		startSession(modelType)
	}, [deleteUnusedSession, startSession])

	return {
		initialization,
		initializationSucceeded,
		hasUserMessage,
		unmounted,
		stopRequested,
		deleteUnusedSession,
		startSession,
		switchModel,
		resetConversation,
	}
}
