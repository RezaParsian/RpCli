import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Static, Text, useInput, useStdin } from 'ink'
import RpCliLogo from './RpCliLogo.js'
import Spinner from './Spinner.js'
import MarkdownText from './MarkdownText.js'

import { ToolConfirmation, useToolConfirmation } from './ToolConfirmation.js'
import { TextArea } from 'react-ink-textarea'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import FzfFilePicker, { createMentionEntries } from './FzfFilePicker.js'
import SlashCommandPicker from './SlashCommandPicker.js'
import { resolveSlashCommand, type SlashCommand } from '../commands/index.js'
import { hideStreamingToolCalls } from '../tools/index.js'
import { InitPrompt } from '../prompts/index.js'
import { isInvalidTokenError } from '../../core-lib/InvalidTokenError.js'
import listWorkspaceFiles from '../../core-lib/ListWorkspaceFiles.js'
import deleteSession from '../../core-lib/DeleteSession.js'
import { CHAT_SYSTEM_PROMPT, getAIResponse } from '../actions/agent.js'
import { stopCurrentGeneration } from '../core/apiClient.js'

const execFileAsync = promisify(execFile)

function mentionQuery(value: string): string | undefined {
	const match = /(?:^|\s)@([^\s@]*)$/.exec(value)
	return match?.[1]
}

function slashCommandQuery(value: string): string | undefined {
	const match = /^\/([^\s/]*)$/.exec(value.trimStart())
	return match?.[1]
}

function endPosition(value: string): [line: number, column: number] {
	const lines = value.split('\n')

	return [lines.length - 1, lines[lines.length - 1]?.length ?? 0]
}

function cursorOffset(value: string, position: [number, number]): number {
	const lines = value.split('\n')

	let offset = 0

	for (let index = 0; index < position[0]; index += 1) {
		offset += (lines[index]?.length ?? 0) + 1
	}

	return offset + position[1]
}

function positionAt(value: string, offset: number): [number, number] {
	const beforeCursor = value.slice(0, Math.max(0, Math.min(offset, value.length)))

	return endPosition(beforeCursor)
}

function previousWordOffset(value: string, offset: number): number {
	const beforeCursor = value.slice(0, offset)
	const result = beforeCursor.search(/\S+\s*$/)

	return result === -1 ? 0 : result
}

function nextWordOffset(value: string, offset: number): number {
	const match = /\s*\S+/.exec(value.slice(offset))

	return match ? offset + match.index + match[0].length : value.length
}

const GraphemeSegmenter = (
	Intl as unknown as {
		Segmenter: new (locale: string, options: { granularity: 'grapheme' }) => {
			segment: (value: string) => Iterable<{
				index: number
				segment: string
			}>
		}
	}
).Segmenter

const graphemeSegmenter = new GraphemeSegmenter('en', {
	granularity: 'grapheme',
})

function previousCharacterOffset(value: string, offset: number): number {
	if (offset <= 0) return 0

	let previousOffset = 0
	for (const segment of graphemeSegmenter.segment(value)) {
		if (segment.index >= offset) break
		previousOffset = segment.index
	}

	return previousOffset
}

function nextCharacterOffset(value: string, offset: number): number {
	if (offset >= value.length) return value.length

	for (const segment of graphemeSegmenter.segment(value)) {
		const end = segment.index + segment.segment.length
		if (end > offset) return end
	}

	return value.length
}

function nextDeleteWordOffset(value: string, offset: number): number {
	const match = /^(?:\s+|\S+\s*)/.exec(value.slice(offset))
	return match ? offset + match[0].length : offset
}

type Message = {
	id: string
	role: 'logo' | 'user' | 'thinking' | 'assistant' | 'console'
	content: string
}

function loadingSpinnerText(streamingMessages: Message[]): string {
	const role = streamingMessages[streamingMessages.length - 1]?.role

	if (role === 'assistant') return 'Writing... Esc to stop'
	if (role === 'console') return 'Running tools... Esc to stop'

	return 'Thinking... Esc to stop'
}

type Props = {
	version?: string
	token: string
	onInvalidToken: () => void
	onExit: (code?: number) => void
}

const MessageRow = React.memo(function MessageRow({ msg, version }: { msg: Message; version?: string }) {
	return (
		<Box flexDirection="column" marginBottom={1}>
			{msg.role === 'logo' && <RpCliLogo version={version} />}

			{msg.role === 'user' && (
				<Box>
					<Text color="magenta" bold>
						{'> '}
						{msg.content}
					</Text>
				</Box>
			)}

			{msg.role === 'assistant' && (
				<Box>
					<Text color="magenta" bold>
						{'✦ '}
					</Text>

					<MarkdownText text={msg.content} />
				</Box>
			)}

			{msg.role === 'thinking' && (
				<Box>
					<Text color="gray" dimColor>
						{'◈ '}
					</Text>

					<Text color="gray" dimColor italic>
						{msg.content}
					</Text>
				</Box>
			)}

			{msg.role === 'console' && (
				<Box>
					<MarkdownText text={msg.content} />
				</Box>
			)}
		</Box>
	)
})

export default function InteractiveChatView({ version, token, onInvalidToken, onExit }: Props) {
	const [messages, setMessages] = useState<Message[]>([
		{
			id: 'header-logo',
			role: 'logo',
			content: '',
		},
	])

	// Preserve the API order of current response, tool, and thinking events.
	const [streamingMessages, setStreamingMessages] = useState<Message[]>([])

	const [input, setInput] = useState('')

	const [cursorPosition, setCursorPosition] = useState<[line: number, column: number]>([0, 0])

	const [loading, setLoading] = useState(false)

	const [thinkingEnabled, setThinkingEnabled] = useState(true)

	const [searchEnabled, setSearchEnabled] = useState(false)

	const [mentionEntries, setMentionEntries] = useState<string[]>([])

	const [filePickerOpen, setFilePickerOpen] = useState(false)

	const [commandPickerOpen, setCommandPickerOpen] = useState(false)

	const [mode, setMode] = useState<'plan' | 'normal' | 'yolo'>('normal')

	const sessionId = useRef<string | undefined>(undefined)

	const initialization = useRef<Promise<void> | undefined>(undefined)

	const initializationSucceeded = useRef(false)
	const hasUserMessage = useRef(false)
	const unmounted = useRef(false)
	const sessionDeleted = useRef(false)
	const stopRequested = useRef(false)

	const { pending, confirmTool } = useToolConfirmation()

	const { stdin } = useStdin()
	const rawBackspaceModifiers = useRef<boolean[]>([])

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

	useInput(
		(_input, key) => {
			const lines = input.split('\n')

			const [line, column] = cursorPosition

			const offset = cursorOffset(input, cursorPosition)

			if (key.backspace || key.delete) {
				if (key.meta) return

				const ctrlBackspace = key.backspace ? rawBackspaceModifiers.current.shift() === true : false
				const deleteByWord = key.ctrl || ctrlBackspace
				const start = key.backspace
					? key.super
						? cursorOffset(input, [line, 0])
						: deleteByWord
						? previousWordOffset(input, offset)
						: previousCharacterOffset(input, offset)
					: offset
				const end = key.delete
					? deleteByWord
						? nextDeleteWordOffset(input, offset)
						: nextCharacterOffset(input, offset)
					: offset

				if (start !== end) {
					const nextValue = input.slice(0, start) + input.slice(end)
					setInput(nextValue)
					setCursorPosition(positionAt(nextValue, start))
					setFilePickerOpen(mentionQuery(nextValue) !== undefined)
					setCommandPickerOpen(slashCommandQuery(nextValue) !== undefined)
				}

				return
			}

			if (key.home || (key.ctrl && key.upArrow)) {
				setCursorPosition(key.ctrl ? [0, 0] : [line, 0])

				return
			}

			if (key.end || (key.ctrl && key.downArrow)) {
				setCursorPosition(key.ctrl ? endPosition(input) : [line, lines[line]?.length ?? 0])

				return
			}

			if (key.leftArrow) {
				const nextOffset =
					key.ctrl || key.meta ? previousWordOffset(input, offset) : previousCharacterOffset(input, offset)

				setCursorPosition(positionAt(input, nextOffset))

				return
			}

			if (key.rightArrow) {
				const nextOffset = key.ctrl || key.meta ? nextWordOffset(input, offset) : nextCharacterOffset(input, offset)

				setCursorPosition(positionAt(input, nextOffset))

				return
			}

			if (key.upArrow && line > 0) {
				setCursorPosition([line - 1, Math.min(column, lines[line - 1]?.length ?? 0)])

				return
			}

			if (key.downArrow && line < lines.length - 1) {
				setCursorPosition([line + 1, Math.min(column, lines[line + 1]?.length ?? 0)])

				return
			}

			if (key.pageUp || key.pageDown) {
				const direction = key.pageUp ? -1 : 1

				const targetLine = Math.max(0, Math.min(lines.length - 1, line + direction * 5))

				setCursorPosition([targetLine, Math.min(column, lines[targetLine]?.length ?? 0)])

				return
			}

			if (key.tab) {
				setMode((previous) => {
					if (previous === 'normal') {
						return 'yolo'
					}

					if (previous === 'yolo') {
						return 'plan'
					}

					return 'normal'
				})
			}
		},
		{
			isActive: !filePickerOpen && !commandPickerOpen && !loading && !pending,
		}
	)

	const handleInputChange = useCallback((value: string) => {
		setInput(value)

		setFilePickerOpen(mentionQuery(value) !== undefined)

		setCommandPickerOpen(slashCommandQuery(value) !== undefined)
	}, [])

	const handleSubmitRef = useRef<(value: string, addToHistory?: boolean) => void>(() => undefined)

	const runCommand = useCallback(
		(command: SlashCommand) => {
			setCommandPickerOpen(false)

			command.execute({
				init() {
					handleSubmitRef.current(InitPrompt(), false)
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

				exit: onExit,
			})
		},
		[onExit]
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

	useEffect(() => {
		void (async () => {
			let files: string[]

			try {
				const { stdout } = await execFileAsync('git', ['ls-files', '--cached', '--others', '--exclude-standard'])

				files = stdout.split('\n').filter(Boolean)
			} catch {
				files = await listWorkspaceFiles()
			}

			setMentionEntries(createMentionEntries(files))
		})()
	}, [])

	const deleteUnusedSession = useCallback(() => {
		if (hasUserMessage.current || sessionDeleted.current || !sessionId.current) {
			return
		}

		sessionDeleted.current = true

		void deleteSession(token, sessionId.current).catch(() => undefined)
	}, [token])

	useEffect(() => {
		initialization.current = (async () => {
			try {
				const response = await getAIResponse(token, CHAT_SYSTEM_PROMPT)

				sessionId.current = response.sessionId

				initializationSucceeded.current = true

				if (unmounted.current) {
					deleteUnusedSession()
				}
			} catch (error) {
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

		return () => {
			unmounted.current = true

			deleteUnusedSession()
		}
	}, [deleteUnusedSession, onInvalidToken, token])

	const handleSubmit = useCallback(
		(value: string, addToHistory: boolean = true) => {
			if (!value.trim() || loading) {
				return
			}

			const slashCommand = resolveSlashCommand(value)

			if (slashCommand) {
				runCommand(slashCommand)
				return
			}

			hasUserMessage.current = true

			const userMessage: Message = {
				id: `user-${Date.now()}-${Math.random()}`,
				role: 'user',
				content: value.trim(),
			}

			if (addToHistory) {
				setMessages((previous) => [...previous, userMessage])
			}

			setInput('')
			setCursorPosition([0, 0])
			setLoading(true)
			stopRequested.current = false

			setStreamingMessages([])

			const streamId = `${Date.now()}-${Math.random()}`

			// Shared ordered buffer for every event in this request.
			let liveMessages: Message[] = []

			const responseContent = new Map<string, string>()

			const thinkingContent = new Map<string, string>()

			let throttleTimer: NodeJS.Timeout | undefined

			let lastFlush = 0

			const upsertLiveMessage = (message: Message) => {
				const index = liveMessages.findIndex((item) => item.id === message.id)

				if (index === -1) {
					liveMessages = [...liveMessages, message]

					return
				}

				liveMessages = liveMessages.map((item, itemIndex) => (itemIndex === index ? message : item))
			}

			const appendLiveMessage = (message: Message) => {
				liveMessages = [...liveMessages, message]
			}

			const flushUpdates = () => {
				if (throttleTimer) {
					clearTimeout(throttleTimer)
				}

				throttleTimer = undefined

				setStreamingMessages([...liveMessages])
			}

			const scheduleFlush = () => {
				const now = Date.now()

				const remaining = 50 - (now - lastFlush)

				if (remaining <= 0) {
					lastFlush = now

					flushUpdates()

					return
				}

				if (!throttleTimer) {
					throttleTimer = setTimeout(() => {
						lastFlush = Date.now()

						flushUpdates()
					}, remaining)
				}
			}

			void (async () => {
				try {
					await initialization.current

					if (stopRequested.current || !initializationSucceeded.current) {
						return
					}

					const fullResponse = await getAIResponse(
						token,

						userMessage.content,

						confirmTool,

						(content) => {
							appendLiveMessage({
								id: `console-${Date.now()}-${Math.random()}`,
								role: 'console',
								content,
							})

							scheduleFlush()
						},

						thinkingEnabled,

						(chunk) => {
							if (chunk.type === 'response') {
								const messageKey = String(chunk.messageId ?? 'pending')

								const id = `${streamId}-${messageKey}-response`

								const previous = responseContent.get(messageKey) ?? ''

								const rawContent = previous + chunk.content

								responseContent.set(messageKey, rawContent)

								const visibleContent = hideStreamingToolCalls(rawContent)

								if (!visibleContent) {
									return
								}

								upsertLiveMessage({
									id,
									role: 'assistant',
									content: visibleContent,
								})

								scheduleFlush()

								return
							}

							if (chunk.type === 'thinking') {
								const messageKey = String(chunk.messageId ?? 'pending')

								const id = `${streamId}-${messageKey}-thinking`

								const previous = thinkingContent.get(messageKey) ?? ''

								const content = previous + chunk.content

								thinkingContent.set(messageKey, content)

								upsertLiveMessage({
									id,
									role: 'thinking',
									content,
								})

								scheduleFlush()
							}
						},

						searchEnabled,
						mode
					)

					if (throttleTimer) {
						clearTimeout(throttleTimer)

						throttleTimer = undefined
					}

					// Avoid duplicating a response already received through streaming.
					const hasStreamedAssistant = liveMessages.some((message) => message.role === 'assistant')

					if (!hasStreamedAssistant) {
						const finalContent = fullResponse.content?.trim()

						if (finalContent) {
							appendLiveMessage({
								id: `${streamId}-assistant-final`,
								role: 'assistant',
								content: finalContent,
							})
						}
					}

					if (liveMessages.length > 0) {
						setMessages((previous) => [...previous, ...liveMessages])
					}

					setStreamingMessages([])
				} catch (error) {
					if (isInvalidTokenError(error)) {
						onInvalidToken()
						return
					}

					if (liveMessages.length > 0) {
						setMessages((previous) => [...previous, ...liveMessages])
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
					if (throttleTimer) {
						clearTimeout(throttleTimer)
					}

					throttleTimer = undefined

					setLoading(false)
				}
			})()
		},
		[loading, token, confirmTool, onInvalidToken, runCommand, thinkingEnabled, searchEnabled, mode]
	)

	handleSubmitRef.current = handleSubmit

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
				) : (
					<Box flexDirection="column">
						<Box justifyContent="space-between" paddingX={1}>
							<Text dimColor>Ready</Text>

							<Box gap={2}>
								<Text>
									Mode:{' '}
									<Text color={mode === 'yolo' ? 'red' : mode === 'normal' ? 'yellow' : 'green'}>{mode}</Text>{' '}
									<Text dimColor>(TAB)</Text>
								</Text>

								<Text>
									Search:{' '}
									<Text color={searchEnabled ? 'green' : 'red'} bold>
										{searchEnabled ? 'ON' : 'OFF'}
									</Text>{' '}
									<Text dimColor>(/search)</Text>
								</Text>

								<Text>
									Thinking:{' '}
									<Text color={thinkingEnabled ? 'green' : 'red'} bold>
										{thinkingEnabled ? 'ON' : 'OFF'}
									</Text>{' '}
									<Text dimColor>(/thinking)</Text>
								</Text>
							</Box>
						</Box>

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
