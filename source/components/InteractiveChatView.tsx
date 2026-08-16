import React, {useCallback, useEffect, useRef, useState} from 'react'
import {Box, Static, Text, useInput, useStdin} from 'ink'
import Spinner from './Spinner.js'
import {ToolConfirmation, useToolConfirmation} from './ToolConfirmation.js'
import {TextArea} from 'react-ink-textarea'
import FzfFilePicker, {createMentionEntries} from './FzfFilePicker.js'
import SlashCommandPicker from './SlashCommandPicker.js'
import ChatStatusBar from './chat/ChatStatusBar.js'
import {createLiveStream} from './chat/createLiveStream.js'
import {MessageRow} from './chat/MessageRow.js'
import PlanConfirmation from './chat/PlanConfirmation.js'
import type {ChatMessage, SubmitOptions} from './chat/types.js'
import {loadingSpinnerText} from './chat/types.js'
import {useChatSession} from './chat/useChatSession.js'
import {useComposerKeys} from './chat/useComposerKeys.js'
import {formatSlashCommandHelp, resolveSlashCommand, type SlashCommand} from '../commands/index.js'
import {hideStreamingToolCalls} from '../tools/index.js'
import {ContinuePrompt, ExecutePlanPrompt, InitPrompt, PlanPrompt, readAgentsMarkdown} from '../prompts/index.js'
import {isInvalidTokenError} from '../../core-lib/index.js'
import listWorkspaceFiles from '../core/ListWorkspaceFiles.js'
import {endPosition, mentionQuery, slashCommandQuery} from '../core/textCursor.js'
import {type ChatMode, getAIResponse} from '../actions/agent.js'
import sendMessage, {stopCurrentGeneration} from '../core/apiClient.js'
import {chatLogDirectory, isChatLoggingEnabled, setChatLoggingEnabled} from '../core/LogChat.js'

type Props = {
	version?: string
	token: string
	onInvalidToken: () => void
	onExit: (code?: number) => void
	onRegisterBeforeExit?: (cleanup?: () => Promise<void>) => void
}

export default function InteractiveChatView({ version, token, onInvalidToken, onExit, onRegisterBeforeExit }: Props) {
	const [messages, setMessages] = useState<ChatMessage[]>([
		{
			id: 'header-logo',
			role: 'logo',
			content: '',
		},
	])

	const [streamingMessages, setStreamingMessages] = useState<ChatMessage[]>([])
	const [input, setInput] = useState('')
	const [cursorPosition, setCursorPosition] = useState<[line: number, column: number]>([0, 0])
	const [loading, setLoading] = useState(false)
	const [thinkingEnabled, setThinkingEnabled] = useState(true)
	const [searchEnabled, setSearchEnabled] = useState(false)
	const [loggingEnabled, setLoggingEnabled] = useState(() => isChatLoggingEnabled())
	const [mentionEntries, setMentionEntries] = useState<string[]>([])
	const [filePickerOpen, setFilePickerOpen] = useState(false)
	const [commandPickerOpen, setCommandPickerOpen] = useState(false)
	const [mode, setMode] = useState<ChatMode>('normal')
	const [awaitingPlanStart, setAwaitingPlanStart] = useState(false)
	const modeBeforePlan = useRef<ChatMode>('normal')

	const {
		initialization,
		initializationSucceeded,
		hasUserMessage,
		unmounted,
		stopRequested,
		deleteUnusedSession,
		startSession,
		resetConversation,
	} = useChatSession({ token, onInvalidToken, setMessages })

	const { pending, confirmTool } = useToolConfirmation()
	const { stdin } = useStdin()
	const rawBackspaceModifiers = useRef<boolean[]>([])
	const handleSubmitRef = useRef<(value: string, options?: SubmitOptions) => void>(() => undefined)
	const mentionListGeneration = useRef(0)

	useEffect(() => {
		const rememberBackspaceEncoding = (data: Buffer | string) => {
			const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data)
			rawBackspaceModifiers.current = [...bytes]
				.filter((byte) => byte === 0x08 || byte === 0x7f)
				.map((byte) => byte === 0x08)
		}

		stdin.prependListener('data', rememberBackspaceEncoding)
		return () => {
			stdin.removeListener('data', rememberBackspaceEncoding)
		}
	}, [stdin])

	const fileQuery = mentionQuery(input) ?? ''
	const commandQuery = slashCommandQuery(input) ?? ''

	useInput((pressedInput, key) => {
		if (key.escape && loading) {
			stopRequested.current = true
			if (initializationSucceeded.current) {
				void stopCurrentGeneration(token)
			}
			return
		}

		if (!key.ctrl || pressedInput.toLowerCase() !== 'c') return

		if (loading) {
			stopRequested.current = true
			if (initializationSucceeded.current) {
				void stopCurrentGeneration(token)
			}
			return
		}

		if (input.length > 0) {
			setInput('')
			setCursorPosition([0, 0])
			setFilePickerOpen(false)
			setCommandPickerOpen(false)
			return
		}

		onExit(130)
	})

	useComposerKeys({
		input,
		cursorPosition,
		setInput,
		setCursorPosition,
		setFilePickerOpen,
		setCommandPickerOpen,
		setMode,
		rawBackspaceModifiers,
		isActive: !filePickerOpen && !commandPickerOpen && !loading && !pending && !awaitingPlanStart,
	})

	const handleInputChange = useCallback((value: string) => {
		setInput(value)
		setFilePickerOpen(mentionQuery(value) !== undefined)
		setCommandPickerOpen(slashCommandQuery(value) !== undefined)
	}, [])

	const runCommand = useCallback(
		(command: SlashCommand) => {
			setCommandPickerOpen(false)

			command.execute({
				init() {
					handleSubmitRef.current(InitPrompt(), { addToHistory: false, reloadAgentsAfter: true })
				},

				continueTask() {
					if (loading) return

					setMessages((previous) => [
						...previous,
						{
							id: `console-${Date.now()}-${Math.random()}`,
							role: 'console',
							content: 'Continuing previous work…',
						},
					])
					handleSubmitRef.current(ContinuePrompt(), { addToHistory: false })
				},

				clear() {
					if (loading) return

					resetConversation()
					setInput('')
					setCursorPosition([0, 0])
					setStreamingMessages([])
					setAwaitingPlanStart(false)
					setMessages((previous) => [
						...previous,
						{
							id: `logo-${Date.now()}-${Math.random()}`,
							role: 'logo',
							content: '',
						},
					])
				},

				help() {
					setMessages((previous) => [
						...previous,
						{
							id: `console-${Date.now()}-${Math.random()}`,
							role: 'console',
							content: formatSlashCommandHelp(),
						},
					])
					setInput('')
				},

				toggleThinking() {
					setThinkingEnabled((current) => {
						const enabled = !current
						setMessages((previous) => [
							...previous,
							{
								id: `console-${Date.now()}-${Math.random()}`,
								role: 'console',
								content: `Thinking ${enabled ? 'enabled' : 'disabled'}.`,
							},
						])
						setInput('')
						return enabled
					})
				},

				toggleSearch() {
					setSearchEnabled((current) => {
						const enabled = !current
						setMessages((previous) => [
							...previous,
							{
								id: `console-${Date.now()}-${Math.random()}`,
								role: 'console',
								content: `Search ${enabled ? 'enabled' : 'disabled'}.`,
							},
						])
						setInput('')
						return enabled
					})
				},

				toggleLogging() {
					setLoggingEnabled((current) => {
						const enabled = !current
						void setChatLoggingEnabled(enabled)
						setMessages((previous) => [
							...previous,
							{
								id: `console-${Date.now()}-${Math.random()}`,
								role: 'console',
								content: enabled
									? `Logging enabled. Transcripts are saved in ${chatLogDirectory}.`
									: 'Logging disabled.',
							},
						])
						setInput('')
						return enabled
					})
				},

				exit: onExit,
			})
		},
		[loading, onExit, resetConversation]
	)

	const updateCommandQuery = useCallback((query: string) => {
		setInput(`/${query}`)
	}, [])

	const selectFile = useCallback(
		(file: string) => {
			const nextInput = input.replace(/@[^\s@]*$/, `@${file} `)
			setInput(nextInput)
			setCursorPosition(endPosition(nextInput))
			setFilePickerOpen(false)
		},
		[input]
	)

	const updateFileQuery = useCallback((query: string) => {
		setInput((previous) => previous.replace(/@[^\s@]*$/, `@${query}`))
	}, [])

	const refreshMentionEntries = useCallback(() => {
		const generation = ++mentionListGeneration.current
		void listWorkspaceFiles()
			.then((files) => {
				if (generation !== mentionListGeneration.current) return
				setMentionEntries(createMentionEntries(files))
			})
			.catch(() => undefined)
	}, [])

	useEffect(() => {
		refreshMentionEntries()
	}, [refreshMentionEntries])

	useEffect(() => {
		if (!filePickerOpen) return
		refreshMentionEntries()
	}, [filePickerOpen, refreshMentionEntries])

	useEffect(() => {
		unmounted.current = false
		startSession()

		return () => {
			unmounted.current = true
			void deleteUnusedSession()
		}
	}, [deleteUnusedSession, startSession])

	useEffect(() => {
		onRegisterBeforeExit?.(deleteUnusedSession)
		return () => onRegisterBeforeExit?.(undefined)
	}, [deleteUnusedSession, onRegisterBeforeExit])

	useEffect(() => {
		if (mode !== 'plan') modeBeforePlan.current = mode
	}, [mode])

	const handleSubmit = useCallback(
		(value: string, options: SubmitOptions = {}) => {
			if (!value.trim() || loading) {
				return
			}

			if (awaitingPlanStart && !options.executeApprovedPlan) {
				return
			}

			const slashCommand = resolveSlashCommand(value)
			if (slashCommand) {
				runCommand(slashCommand)
				return
			}

			hasUserMessage.current = true

			const addToHistory = options.addToHistory ?? true
			const effectiveMode = options.modeOverride ?? mode
			const userMessage: ChatMessage = {
				id: `user-${Date.now()}-${Math.random()}`,
				role: 'user',
				content: value.trim(),
			}
			const apiPrompt =
				effectiveMode === 'plan' && !options.executeApprovedPlan && addToHistory
					? PlanPrompt(userMessage.content)
					: userMessage.content

			if (addToHistory) {
				setMessages((previous) => [...previous, userMessage])
			}

			setInput('')
			setCursorPosition([0, 0])
			setLoading(true)
			stopRequested.current = false
			setStreamingMessages([])

			const streamId = `${Date.now()}-${Math.random()}`
			const responseContent = new Map<string, string>()
			const thinkingContent = new Map<string, string>()
			const stream = createLiveStream((next) => setStreamingMessages(next))

			void (async () => {
				try {
					await initialization.current

					if (stopRequested.current || !initializationSucceeded.current) {
						return
					}

					const fullResponse = await getAIResponse({
						token,
						prompt: apiPrompt,
						confirmTool,
						onToolMessage: (content) => {
							stream.append({
								id: `console-${Date.now()}-${Math.random()}`,
								role: 'console',
								content,
							})
							stream.scheduleFlush()
						},
						thinkingEnabled,
						onChunk: (chunk) => {
							if (chunk.type === 'response') {
								const messageKey = String(chunk.messageId ?? 'pending')
								const id = `${streamId}-${messageKey}-response`
								const previous = responseContent.get(messageKey) ?? ''
								const rawContent = previous + chunk.content
								responseContent.set(messageKey, rawContent)
								const visibleContent = hideStreamingToolCalls(rawContent)
								if (!visibleContent) return

								stream.upsert({ id, role: 'assistant', content: visibleContent })
								stream.scheduleFlush()
								return
							}

							if (chunk.type === 'thinking') {
								const messageKey = String(chunk.messageId ?? 'pending')
								const id = `${streamId}-${messageKey}-thinking`
								const previous = thinkingContent.get(messageKey) ?? ''
								const content = previous + chunk.content
								thinkingContent.set(messageKey, content)
								stream.upsert({ id, role: 'thinking', content })
								stream.scheduleFlush()
							}
						},
						searchEnabled,
						mode: effectiveMode,
					})

					stream.dispose()

					if (!stream.messages.some((message) => message.role === 'assistant')) {
						const finalContent = fullResponse.content?.trim()
						if (finalContent) {
							stream.append({
								id: `${streamId}-assistant-final`,
								role: 'assistant',
								content: finalContent,
							})
						}
					}

					if (stream.messages.length > 0) {
						setMessages((previous) => [...previous, ...stream.messages])
					}

					setStreamingMessages([])

					if (options.reloadAgentsAfter && !stopRequested.current && !fullResponse.stopped) {
						const agents = readAgentsMarkdown().trim()

						if (agents) {
							try {
								await sendMessage({
									token,
									prompt: `AGENTS.md is now the project-specific ground truth for this session. Follow it unless the user asks otherwise.\n\n${agents}`,
									thinkingEnabled,
									searchEnabled,
								})

								if (!unmounted.current) {
									setMessages((previous) => [
										...previous,
										{
											id: `console-${Date.now()}-${Math.random()}`,
											role: 'console',
											content: 'Loaded AGENTS.md into this session.',
										},
									])
								}
							} catch {
								// The file is on disk even if the follow-up message fails.
							}
						}
					}

					if (
						effectiveMode === 'plan' &&
						!options.executeApprovedPlan &&
						!options.reloadAgentsAfter &&
						!stopRequested.current &&
						!fullResponse.stopped &&
						!unmounted.current
					) {
						setAwaitingPlanStart(true)
					}
				} catch (error) {
					if (isInvalidTokenError(error)) {
						onInvalidToken()
						return
					}

					if (stream.messages.length > 0) {
						setMessages((previous) => [...previous, ...stream.messages])
					}

					if (stopRequested.current || (error instanceof Error && error.name === 'AbortError')) {
						setStreamingMessages([])
						return
					}

					setMessages((previous) => [
						...previous,
						{
							id: `${streamId}-error`,
							role: 'assistant',
							content: `Error: ${error instanceof Error ? error.message : String(error)}`,
						},
					])

					setStreamingMessages([])
				} finally {
					stream.dispose()
					setLoading(false)
				}
			})()
		},
		[
			confirmTool,
			hasUserMessage,
			initialization,
			initializationSucceeded,
			loading,
			mode,
			onInvalidToken,
			runCommand,
			searchEnabled,
			stopRequested,
			thinkingEnabled,
			token,
			unmounted,
			awaitingPlanStart,
		]
	)

	handleSubmitRef.current = handleSubmit

	const handlePlanDecision = useCallback((start: boolean) => {
		setAwaitingPlanStart(false)

		if (!start) {
			setMessages((previous) => [
				...previous,
				{
					id: `console-${Date.now()}-${Math.random()}`,
					role: 'console',
					content: 'Plan not started. Still in plan mode.',
				},
			])
			return
		}

		const executeMode = modeBeforePlan.current
		setMode(executeMode)
		setMessages((previous) => [
			...previous,
			{
				id: `console-${Date.now()}-${Math.random()}`,
				role: 'console',
				content: `Starting the plan in ${executeMode} mode…`,
			},
		])
		handleSubmitRef.current(ExecutePlanPrompt(executeMode), {
			addToHistory: false,
			executeApprovedPlan: true,
			modeOverride: executeMode,
		})
	}, [])

	return (
		<Box flexDirection="column">
			<Static items={messages}>{(msg) => <MessageRow key={msg.id} msg={msg} version={version} />}</Static>

			<Box flexDirection="column" marginX={1} marginTop={1}>
				{streamingMessages.map((msg) => (
					<MessageRow key={msg.id} msg={msg} version={version} />
				))}

				{pending ? (
					<ToolConfirmation details={pending.details} />
				) : loading ? (
					<Spinner text={loadingSpinnerText(streamingMessages)} />
				) : awaitingPlanStart ? (
					<PlanConfirmation onDecide={handlePlanDecision} />
				) : (
					<Box flexDirection="column">
						<ChatStatusBar
							mode={mode}
							searchEnabled={searchEnabled}
							thinkingEnabled={thinkingEnabled}
							loggingEnabled={loggingEnabled}
						/>

						<Box
							borderStyle="single"
							borderLeft={false}
							borderRight={false}
							borderColor="cyan"
							flexDirection="column"
						>
							<Box>
								<Text color="magenta" bold>
									{'> '}
								</Text>

								<TextArea
									focus={!filePickerOpen && !commandPickerOpen}
									value={input}
									cursorPosition={cursorPosition}
									keybindings={{
										Up: false,
										Down: false,
										Left: false,
										Right: false,
										Backspace: false,
										Delete: false,
										'Alt+Backspace': false,
									}}
									onChange={handleInputChange}
									onCursorChange={(position) => setCursorPosition(position)}
									onSubmit={handleSubmit}
									placeholder="Type @ to mention a file or folder... (Ctrl+J for newline)"
									showInvisibles={{
										space: false,
										tab: true,
										newline: false,
									}}
								/>
							</Box>

							{filePickerOpen && (
								<FzfFilePicker
									entries={mentionEntries}
									query={fileQuery}
									onCancel={() => setFilePickerOpen(false)}
									onQueryChange={updateFileQuery}
									onSelect={selectFile}
								/>
							)}

							{commandPickerOpen && (
								<SlashCommandPicker
									query={commandQuery}
									onCancel={() => setCommandPickerOpen(false)}
									onQueryChange={updateCommandQuery}
									onSelect={runCommand}
								/>
							)}
						</Box>
					</Box>
				)}
			</Box>
		</Box>
	)
}
