import React, { useCallback, useEffect, useState } from 'react'
import { Box, Text, useApp } from 'ink'
import Spinner from './Spinner.js'
import MarkdownText from './MarkdownText.js'
import { ToolConfirmation, useToolConfirmation } from './ToolConfirmation.js'
import { hideStreamingToolCalls } from '../tools/index.js'
import { deleteSession, isInvalidTokenError } from '../../core-lib/index.js'
import { getChatSystemPrompt, getAIResponse } from '../actions/agent.js'

type State = 'loading' | 'done' | 'error'

type Props = {
	prompt: string
	thinking: boolean
	quiet: boolean
	search: boolean
	token: string
	onInvalidToken: () => void
}

export default function SinglePromptView({ prompt, thinking, quiet, search, token, onInvalidToken }: Props) {
	const { exit } = useApp()
	const [state, setState] = useState<State>('loading')
	const [response, setResponse] = useState('')
	const [thinkingResponse, setThinkingResponse] = useState('')
	const [error, setError] = useState('')
	const [toolMessages, setToolMessages] = useState<string[]>([])
	const { pending, confirmTool } = useToolConfirmation()
	const handleToolMessage = useCallback((content: string) => {
		setToolMessages((previous) => [...previous, content])
	}, [])

	useEffect(() => {
		let streamedResponse = ''
		void (async () => {
			try {
				await getAIResponse({
					token,
					prompt: getChatSystemPrompt(),
					thinkingEnabled: thinking,
					searchEnabled: search,
				})

				const fullResponse = await getAIResponse({
					token,
					prompt,
					confirmTool,
					onToolMessage: handleToolMessage,
					thinkingEnabled: thinking,
					onChunk: (chunk) => {
						if (chunk.type === 'thinking') {
							setThinkingResponse((previous) => previous + chunk.content)
						} else {
							streamedResponse += chunk.content
							setResponse(hideStreamingToolCalls(streamedResponse))
						}
					},
					searchEnabled: search,
				})

				deleteSession(token, fullResponse.sessionId)

				setResponse(fullResponse.content ?? 'Ai Error!')
				setThinkingResponse(fullResponse.thinkingContent ?? '')
				setState('done')
			} catch (err) {
				if (isInvalidTokenError(err)) {
					onInvalidToken()
					return
				}
				setError(err instanceof Error ? err.message : String(err))
				setState('error')
			}
		})()
	}, [prompt, thinking, quiet, search, token, confirmTool, handleToolMessage, onInvalidToken])

	useEffect(() => {
		if (state !== 'done' && state !== 'error') return
		const timer = setTimeout(() => exit(), 100)
		return () => clearTimeout(timer)
	}, [state, exit])

	if (state === 'error') {
		return (
			<Text color="red" bold>
				✖ Error: {error}
			</Text>
		)
	}

	return (
		<Box flexDirection="column">
			{thinkingResponse && !quiet && (
				<Box marginBottom={1}>
					<Text color="gray" dimColor>
						{'◈ '}
					</Text>
					<Text color="gray" dimColor italic>
						{thinkingResponse}
					</Text>
				</Box>
			)}
			{toolMessages.map((message, index) => (
				<Box key={index} marginBottom={1}>
					<MarkdownText text={message} />
				</Box>
			))}
			{pending ? (
				<ToolConfirmation details={pending.details} />
			) : response ? (
				<MarkdownText text={response} />
			) : (
				<Spinner text="Thinking..." />
			)}
		</Box>
	)
}
