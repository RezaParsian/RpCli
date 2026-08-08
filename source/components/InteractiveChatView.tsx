import React, {useCallback, useEffect, useRef, useState,} from 'react';
import {Box, Static, Text, useInput} from 'ink';
import RpCliLogo from './RpCliLogo.js';
import Spinner from './Spinner.js';
import MarkdownText from './MarkdownText.js';

import {ToolConfirmation, useToolConfirmation,} from './ToolConfirmation.js';
import {TextArea} from 'react-ink-textarea';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import FzfFilePicker, {createMentionEntries,} from './FzfFilePicker.js';
import SlashCommandPicker from './SlashCommandPicker.js';
import {resolveSlashCommand, type SlashCommand,} from '../commands/index.js';
import {hideStreamingToolCalls} from '../tools/index.js';
import {InitPrompt} from '../prompts/index.js';
import {isInvalidTokenError} from '../../core-lib/InvalidTokenError.js';
import listWorkspaceFiles from '../../core-lib/ListWorkspaceFiles.js';
import deleteSession from '../../core-lib/DeleteSession.js';
import {CHAT_SYSTEM_PROMPT, getAIResponse} from "../actions/agent.js";

const execFileAsync = promisify(execFile);

function mentionQuery(value: string): string | undefined {
	const match = /(?:^|\s)@([^\s@]*)$/.exec(value);
	return match?.[1];
}

function slashCommandQuery(value: string): string | undefined {
	const match = /^\/([^\s/]*)$/.exec(value.trimStart());
	return match?.[1];
}

function endPosition(
	value: string,
): [line: number, column: number] {
	const lines = value.split('\n');

	return [
		lines.length - 1,
		lines[lines.length - 1]?.length ?? 0,
	];
}

function cursorOffset(
	value: string,
	position: [number, number],
): number {
	const lines = value.split('\n');

	let offset = 0;

	for (let index = 0; index < position[0]; index += 1) {
		offset += (lines[index]?.length ?? 0) + 1;
	}

	return offset + position[1];
}

function positionAt(
	value: string,
	offset: number,
): [number, number] {
	const beforeCursor = value.slice(
		0,
		Math.max(0, Math.min(offset, value.length)),
	);

	return endPosition(beforeCursor);
}

function previousWordOffset(
	value: string,
	offset: number,
): number {
	const beforeCursor = value.slice(0, offset);
	const result = beforeCursor.search(/\S+\s*$/);

	return result === -1 ? 0 : result;
}

function nextWordOffset(
	value: string,
	offset: number,
): number {
	const match = /\s*\S+/.exec(value.slice(offset));

	return match
		? offset + match.index + match[0].length
		: value.length;
}

type Message = {
	id: string;
	role:
		| 'logo'
		| 'user'
		| 'thinking'
		| 'assistant'
		| 'console';
	content: string;
};

type Props = {
	version?: string;
	token: string;
	onInvalidToken: () => void;
	onExit: () => void;
};

const MessageRow = React.memo(function MessageRow({
													  msg,
													  version,
												  }: {
	msg: Message;
	version?: string;
}) {
	return (
		<Box flexDirection="column" marginBottom={1}>
			{msg.role === 'logo' && (
				<RpCliLogo version={version}/>
			)}

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

					<MarkdownText text={msg.content}/>
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
					<MarkdownText text={msg.content}/>
				</Box>
			)}
		</Box>
	);
});

export default function InteractiveChatView({
												version,
												token,
												onInvalidToken,
												onExit,
											}: Props) {
	/*
	 * Finished / static messages.
	 *
	 * The logo is always the first static item.
	 */
	const [messages, setMessages] = useState<Message[]>([
		{
			id: 'header-logo',
			role: 'logo',
			content: '',
		},
	]);

	/*
	 * Messages for the currently-running request.
	 *
	 * IMPORTANT:
	 *
	 * assistant responses
	 * tool/console messages
	 * thinking messages
	 *
	 * all live here while the request is running.
	 *
	 * This is what keeps their actual event order intact.
	 */
	const [streamingMessages, setStreamingMessages] =
		useState<Message[]>([]);

	const [input, setInput] = useState('');

	const [cursorPosition, setCursorPosition] = useState<
		[line: number, column: number]
	>([0, 0]);

	const [loading, setLoading] = useState(false);

	const [thinkingEnabled, setThinkingEnabled] =
		useState(true);

	const [searchEnabled, setSearchEnabled] =
		useState(false);

	const [mentionEntries, setMentionEntries] =
		useState<string[]>([]);

	const [filePickerOpen, setFilePickerOpen] =
		useState(false);

	const [commandPickerOpen, setCommandPickerOpen] =
		useState(false);

	const [mode, setMode] = useState<
		'plan' | 'normal' | 'yolo'
	>('normal');

	const sessionId = useRef<string | undefined>(
		undefined,
	);

	const initialization = useRef<
		Promise<void> | undefined
	>(undefined);

	const initializationSucceeded = useRef(false);
	const hasUserMessage = useRef(false);
	const unmounted = useRef(false);
	const sessionDeleted = useRef(false);

	const {pending, confirmTool} =
		useToolConfirmation();

	const fileQuery = mentionQuery(input) ?? '';

	const commandQuery =
		slashCommandQuery(input) ?? '';

	/*
	 * Keyboard navigation.
	 */
	useInput(
		(_input, key) => {
			const lines = input.split('\n');

			const [line, column] =
				cursorPosition;

			const offset = cursorOffset(
				input,
				cursorPosition,
			);

			if (
				key.home ||
				(key.ctrl && key.upArrow)
			) {
				setCursorPosition(
					key.ctrl
						? [0, 0]
						: [line, 0],
				);

				return;
			}

			if (
				key.end ||
				(key.ctrl && key.downArrow)
			) {
				setCursorPosition(
					key.ctrl
						? endPosition(input)
						: [
							line,
							lines[line]?.length ??
							0,
						],
				);

				return;
			}

			if (key.leftArrow) {
				const nextOffset = key.ctrl
					? previousWordOffset(
						input,
						offset,
					)
					: Math.max(
						0,
						offset - 1,
					);

				setCursorPosition(
					positionAt(
						input,
						nextOffset,
					),
				);

				return;
			}

			if (key.rightArrow) {
				const nextOffset = key.ctrl
					? nextWordOffset(
						input,
						offset,
					)
					: Math.min(
						input.length,
						offset + 1,
					);

				setCursorPosition(
					positionAt(
						input,
						nextOffset,
					),
				);

				return;
			}

			if (
				key.upArrow &&
				line > 0
			) {
				setCursorPosition([
					line - 1,
					Math.min(
						column,
						lines[line - 1]
							?.length ?? 0,
					),
				]);

				return;
			}

			if (
				key.downArrow &&
				line < lines.length - 1
			) {
				setCursorPosition([
					line + 1,
					Math.min(
						column,
						lines[line + 1]
							?.length ?? 0,
					),
				]);

				return;
			}

			if (
				key.pageUp ||
				key.pageDown
			) {
				const direction =
					key.pageUp ? -1 : 1;

				const targetLine =
					Math.max(
						0,
						Math.min(
							lines.length - 1,
							line +
							direction * 5,
						),
					);

				setCursorPosition([
					targetLine,
					Math.min(
						column,
						lines[targetLine]
							?.length ?? 0,
					),
				]);

				return;
			}

			if (key.tab) {
				setMode(previous => {
					if (
						previous === 'normal'
					) {
						return 'yolo';
					}

					if (
						previous === 'yolo'
					) {
						return 'plan';
					}

					return 'normal';
				});
			}
		},
		{
			isActive:
				!filePickerOpen &&
				!commandPickerOpen &&
				!loading &&
				!pending,
		},
	);

	const handleInputChange = useCallback(
		(value: string) => {
			setInput(value);

			setFilePickerOpen(
				mentionQuery(value) !==
				undefined,
			);

			setCommandPickerOpen(
				slashCommandQuery(value) !==
				undefined,
			);
		},
		[],
	);

	/*
	 * Declared here because slash-command execution
	 * eventually calls handleSubmit().
	 */
	const handleSubmitRef = useRef<
		(
			value: string,
			addToHistory?: boolean,
		) => void
	>(() => undefined);

	const runCommand = useCallback(
		(command: SlashCommand) => {
			setCommandPickerOpen(false);

			command.execute({
				init() {
					handleSubmitRef.current(
						InitPrompt(),
						false,
					);
				},

				toggleThinking() {
					setThinkingEnabled(
						current => {
							const enabled =
								!current;

							setMessages(
								previous => [
									...previous,
									{
										id: `console-${Date.now()}-${Math.random()}`,
										role: 'console',
										content: `Thinking ${
											enabled
												? 'enabled'
												: 'disabled'
										}.`,
									},
								],
							);

							setInput('');

							return enabled;
						},
					);
				},

				toggleSearch() {
					setSearchEnabled(
						current => {
							const enabled =
								!current;

							setMessages(
								previous => [
									...previous,
									{
										id: `console-${Date.now()}-${Math.random()}`,
										role: 'console',
										content: `Search ${
											enabled
												? 'enabled'
												: 'disabled'
										}.`,
									},
								],
							);

							setInput('');

							return enabled;
						},
					);
				},

				exit: onExit,
			});
		},
		[onExit],
	);

	const updateCommandQuery = useCallback(
		(query: string) => {
			setInput(`/${query}`);
		},
		[],
	);

	const selectFile = useCallback(
		(file: string) => {
			const nextInput =
				input.replace(
					/@[^\s@]*$/,
					`@${file} `,
				);

			setInput(nextInput);

			setCursorPosition(
				endPosition(nextInput),
			);

			setFilePickerOpen(false);
		},
		[input],
	);

	const updateFileQuery = useCallback(
		(query: string) => {
			setInput(previous =>
				previous.replace(
					/@[^\s@]*$/,
					`@${query}`,
				),
			);
		},
		[],
	);

	/*
	 * Load workspace files for @ mentions.
	 */
	useEffect(() => {
		void (async () => {
			let files: string[];

			try {
				const {stdout} =
					await execFileAsync(
						'git',
						[
							'ls-files',
							'--cached',
							'--others',
							'--exclude-standard',
						],
					);

				files = stdout
					.split('\n')
					.filter(Boolean);
			} catch {
				files =
					await listWorkspaceFiles();
			}

			setMentionEntries(
				createMentionEntries(files),
			);
		})();
	}, []);

	const deleteUnusedSession =
		useCallback(() => {
			if (
				hasUserMessage.current ||
				sessionDeleted.current ||
				!sessionId.current
			) {
				return;
			}

			sessionDeleted.current = true;

			void deleteSession(
				token,
				sessionId.current,
			).catch(() => undefined);
		}, [token]);

	/*
	 * Initial API/session initialization.
	 */
	useEffect(() => {
		initialization.current =
			(async () => {
				try {
					const response =
						await getAIResponse(
							token,
							CHAT_SYSTEM_PROMPT,
						);

					sessionId.current =
						response.sessionId;

					initializationSucceeded.current =
						true;

					if (
						unmounted.current
					) {
						deleteUnusedSession();
					}
				} catch (error) {
					if (
						isInvalidTokenError(
							error,
						)
					) {
						onInvalidToken();
						return;
					}

					if (
						!unmounted.current
					) {
						setMessages(
							previous => [
								...previous,
								{
									id: `err-${Date.now()}`,
									role: 'assistant',
									content: `Error: ${
										error instanceof
										Error
											? error.message
											: String(
												error,
											)
									}`,
								},
							],
						);
					}
				}
			})();

		return () => {
			unmounted.current = true;

			deleteUnusedSession();
		};
	}, [
		deleteUnusedSession,
		onInvalidToken,
		token,
	]);

	const handleSubmit = useCallback(
		(
			value: string,
			addToHistory: boolean = true,
		) => {
			if (
				!value.trim() ||
				loading
			) {
				return;
			}

			const slashCommand =
				resolveSlashCommand(value);

			if (slashCommand) {
				runCommand(slashCommand);
				return;
			}

			hasUserMessage.current = true;

			const userMessage: Message = {
				id: `user-${Date.now()}-${Math.random()}`,
				role: 'user',
				content: value.trim(),
			};

			/*
			 * User input immediately becomes static.
			 *
			 * This guarantees:
			 *
			 * > user message
			 *
			 * always renders before any response,
			 * thinking or tool message.
			 */
			if (addToHistory) {
				setMessages(previous => [
					...previous,
					userMessage,
				]);
			}

			setInput('');
			setCursorPosition([0, 0]);
			setLoading(true);

			/*
			 * Clear the dynamic area for the new
			 * request.
			 */
			setStreamingMessages([]);

			const streamId =
				`${Date.now()}-${Math.random()}`;

			/*
			 * This local array is the source of truth
			 * for the current turn.
			 *
			 * Every callback inserts or updates
			 * messages here.
			 *
			 * Because every event shares this one
			 * array, event ordering is preserved.
			 */
			let liveMessages: Message[] = [];

			/*
			 * Keep separate accumulated text for each
			 * assistant response message.
			 *
			 * This matters because a tool call can
			 * result in multiple assistant message
			 * IDs during one request.
			 */
			const responseContent =
				new Map<string, string>();

			/*
			 * Same idea for thinking chunks.
			 */
			const thinkingContent =
				new Map<string, string>();

			let throttleTimer:
				| NodeJS.Timeout
				| undefined;

			let lastFlush = 0;

			/*
			 * Update one existing live event without
			 * changing its original position.
			 *
			 * If the event does not exist yet, append
			 * it to the END of the list.
			 *
			 * Therefore:
			 *
			 * response
			 * tool
			 * tool
			 * thinking
			 *
			 * stays in exactly that order.
			 */
			const upsertLiveMessage = (
				message: Message,
			) => {
				const index =
					liveMessages.findIndex(
						item =>
							item.id ===
							message.id,
					);

				if (index === -1) {
					liveMessages = [
						...liveMessages,
						message,
					];

					return;
				}

				liveMessages = liveMessages.map(
					(item, itemIndex) =>
						itemIndex === index
							? message
							: item,
				);
			};

			/*
			 * Tool messages are individual events,
			 * so they must always be appended instead
			 * of merged.
			 */
			const appendLiveMessage = (
				message: Message,
			) => {
				liveMessages = [
					...liveMessages,
					message,
				];
			};

			const flushUpdates = () => {
				if (throttleTimer) {
					clearTimeout(
						throttleTimer,
					);
				}

				throttleTimer = undefined;

				/*
				 * Copy the array so React always sees
				 * a new reference.
				 */
				setStreamingMessages([
					...liveMessages,
				]);
			};

			const scheduleFlush = () => {
				const now = Date.now();

				const remaining =
					50 - (now - lastFlush);

				if (remaining <= 0) {
					lastFlush = now;

					flushUpdates();

					return;
				}

				if (!throttleTimer) {
					throttleTimer =
						setTimeout(() => {
							lastFlush =
								Date.now();

							flushUpdates();
						}, remaining);
				}
			};

			void (async () => {
				try {
					await initialization.current;

					if (
						!initializationSucceeded.current
					) {
						return;
					}

					const fullResponse =
						await getAIResponse(
							token,

							userMessage.content,

							confirmTool,

							/*
							 * ===================================
							 * TOOL / CONSOLE EVENTS
							 * ===================================
							 *
							 * Do NOT put these directly in
							 * setMessages().
							 *
							 * Doing so moves them into <Static>
							 * while response/thinking remains
							 * dynamic and destroys event order.
							 */
							content => {
								appendLiveMessage({
									id: `console-${Date.now()}-${Math.random()}`,
									role: 'console',
									content,
								});

								scheduleFlush();
							},

							thinkingEnabled,

							/*
							 * ===================================
							 * STREAM EVENTS
							 * ===================================
							 */
							chunk => {
								/*
								 * -------------------------------
								 * ASSISTANT RESPONSE
								 * -------------------------------
								 */
								if (
									chunk.type ===
									'response'
								) {
									const messageKey =
										String(
											chunk.messageId ??
											'pending',
										);

									const id =
										`${streamId}-${messageKey}-response`;

									const previous =
										responseContent.get(
											messageKey,
										) ?? '';

									const rawContent =
										previous +
										chunk.content;

									responseContent.set(
										messageKey,
										rawContent,
									);

									const visibleContent =
										hideStreamingToolCalls(
											rawContent,
										);

									/*
									 * If the response currently only
									 * consists of hidden tool syntax,
									 * don't create an empty UI row.
									 */
									if (
										!visibleContent
									) {
										return;
									}

									upsertLiveMessage({
										id,
										role: 'assistant',
										content:
										visibleContent,
									});

									scheduleFlush();

									return;
								}

								/*
								 * -------------------------------
								 * THINKING
								 * -------------------------------
								 */
								if (
									chunk.type ===
									'thinking'
								) {
									const messageKey =
										String(
											chunk.messageId ??
											'pending',
										);

									const id =
										`${streamId}-${messageKey}-thinking`;

									const previous =
										thinkingContent.get(
											messageKey,
										) ?? '';

									const content =
										previous +
										chunk.content;

									thinkingContent.set(
										messageKey,
										content,
									);

									upsertLiveMessage({
										id,
										role: 'thinking',
										content,
									});

									scheduleFlush();
								}
							},

							searchEnabled,
							mode,
						);

					/*
					 * Stop any pending throttled UI
					 * update before finalizing.
					 */
					if (throttleTimer) {
						clearTimeout(
							throttleTimer,
						);

						throttleTimer =
							undefined;
					}

					/*
					 * Check whether the streamed events
					 * already contain an assistant
					 * response.
					 *
					 * This is CRITICAL for preventing:
					 *
					 * ✦ I'll read both files...
					 *
					 * appearing twice.
					 */
					const hasStreamedAssistant =
						liveMessages.some(
							message =>
								message.role ===
								'assistant',
						);

					/*
					 * Some API implementations may not
					 * provide response chunks at all.
					 *
					 * In that case—and ONLY in that
					 * case—we use fullResponse.content
					 * as a fallback.
					 */
					if (
						!hasStreamedAssistant
					) {
						const finalContent =
							fullResponse.content?.trim();

						if (finalContent) {
							appendLiveMessage({
								id: `${streamId}-assistant-final`,
								role: 'assistant',
								content:
								finalContent,
							});
						}
					}

					/*
					 * Move the exact live event
					 * sequence into Static history.
					 *
					 * Example:
					 *
					 * ✦ response
					 * ⚙ tool
					 * ⚙ tool
					 * ◈ thinking
					 *
					 * Nothing is rebuilt or reordered.
					 */
					if (
						liveMessages.length > 0
					) {
						setMessages(
							previous => [
								...previous,
								...liveMessages,
							],
						);
					}

					/*
					 * Remove the dynamic copy after
					 * placing the same sequence in
					 * Static.
					 */
					setStreamingMessages([]);
				} catch (error) {
					if (
						isInvalidTokenError(
							error,
						)
					) {
						onInvalidToken();
						return;
					}

					/*
					 * Preserve any events that happened
					 * before the error.
					 */
					if (
						liveMessages.length > 0
					) {
						setMessages(
							previous => [
								...previous,
								...liveMessages,
							],
						);
					}

					setMessages(previous => [
						...previous,
						{
							id: `${streamId}-error`,
							role: 'assistant',
							content: `Error: ${
								error instanceof Error
									? error.message
									: String(error)
							}`,
						},
					]);

					setStreamingMessages([]);
				} finally {
					if (throttleTimer) {
						clearTimeout(
							throttleTimer,
						);
					}

					throttleTimer =
						undefined;

					setLoading(false);
				}
			})();
		},
		[
			loading,
			token,
			confirmTool,
			onInvalidToken,
			runCommand,
			thinkingEnabled,
			searchEnabled,
			mode,
		],
	);

	/*
	 * Keep the ref synchronized so /init can invoke
	 * the latest handleSubmit without a
	 * declaration-order/circular callback problem.
	 */
	handleSubmitRef.current = handleSubmit;

	return (
		<Box flexDirection="column">
			{/*
			 * Finished history.
			 *
			 * User message gets inserted here first.
			 */}
			<Static items={messages}>
				{msg => (
					<MessageRow
						key={msg.id}
						msg={msg}
						version={version}
					/>
				)}
			</Static>

			{/*
			 * Dynamic/current request.
			 *
			 * All response/tool/thinking events share
			 * the SAME ordered list.
			 */}
			<Box
				flexDirection="column"
				marginX={1}
				marginTop={1}
			>
				{streamingMessages.map(
					msg => (
						<MessageRow
							key={msg.id}
							msg={msg}
							version={
								version
							}
						/>
					),
				)}

				{pending ? (
					<ToolConfirmation
						details={
							pending.details
						}
					/>
				) : loading ? (
					<Spinner text="Thinking..."/>
				) : (
					<Box flexDirection="column">
						<Box
							justifyContent="space-between"
							paddingX={1}
						>
							<Text dimColor>
								Ready
							</Text>

							<Box gap={2}>
								<Text>
									Mode:{' '}
									<Text
										color={
											mode ===
											'yolo'
												? 'red'
												: mode ===
												'normal'
													? 'yellow'
													: 'green'
										}
									>
										{mode}
									</Text>{' '}
									<Text dimColor>
										(TAB)
									</Text>
								</Text>

								<Text>
									Search:{' '}
									<Text
										color={
											searchEnabled
												? 'green'
												: 'red'
										}
										bold
									>
										{searchEnabled
											? 'ON'
											: 'OFF'}
									</Text>{' '}
									<Text dimColor>
										(/search)
									</Text>
								</Text>

								<Text>
									Thinking:{' '}
									<Text
										color={
											thinkingEnabled
												? 'green'
												: 'red'
										}
										bold
									>
										{thinkingEnabled
											? 'ON'
											: 'OFF'}
									</Text>{' '}
									<Text dimColor>
										(/thinking)
									</Text>
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
								<Text
									color="magenta"
									bold
								>
									{'> '}
								</Text>

								<TextArea
									focus={
										!filePickerOpen &&
										!commandPickerOpen
									}
									value={input}
									cursorPosition={
										cursorPosition
									}
									keybindings={{
										Up: false,
										Down: false,
										Left: false,
										Right: false,
									}}
									onChange={
										handleInputChange
									}
									onCursorChange={
										position =>
											setCursorPosition(
												position,
											)
									}
									onSubmit={
										handleSubmit
									}
									placeholder="Type @ to mention a file or folder... (Ctrl+J for newline)"
									showInvisibles={{
										space: false,
										tab: true,
										newline:
											false,
									}}
								/>
							</Box>

							{filePickerOpen && (
								<FzfFilePicker
									entries={
										mentionEntries
									}
									query={
										fileQuery
									}
									onCancel={() =>
										setFilePickerOpen(
											false,
										)
									}
									onQueryChange={
										updateFileQuery
									}
									onSelect={
										selectFile
									}
								/>
							)}

							{commandPickerOpen && (
								<SlashCommandPicker
									query={
										commandQuery
									}
									onCancel={() =>
										setCommandPickerOpen(
											false,
										)
									}
									onQueryChange={
										updateCommandQuery
									}
									onSelect={
										runCommand
									}
								/>
							)}
						</Box>
					</Box>
				)}
			</Box>
		</Box>
	);
}
