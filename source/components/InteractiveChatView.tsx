import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import RpCliLogo from './RpCliLogo.js';
import Spinner from './Spinner.js';
import MarkdownText from './MarkdownText.js';
import {CHAT_SYSTEM_PROMPT, getAIResponse} from '../actions/chat.js';
import {ToolConfirmation, useToolConfirmation} from './ToolConfirmation.js';
import deleteSession from '../core/DeleteSession.js';
import {isInvalidTokenError} from '../core/InvalidTokenError.js';
import {TextArea} from 'react-ink-textarea';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import FzfFilePicker, {createMentionEntries} from './FzfFilePicker.js';
import listWorkspaceFiles from '../core/ListWorkspaceFiles.js';
import SlashCommandPicker from './SlashCommandPicker.js';
import {resolveSlashCommand, type SlashCommand} from '../commands/index.js';

const execFileAsync = promisify(execFile);

function mentionQuery(value: string): string | undefined {
	const match = /(?:^|\s)@([^\s@]*)$/.exec(value);
	return match?.[1];
}

function slashCommandQuery(value: string): string | undefined {
	const match = /^\/([^\s/]*)$/.exec(value.trimStart());
	return match?.[1];
}

function endPosition(value: string): [line: number, column: number] {
	const lines = value.split('\n');
	return [lines.length - 1, lines[lines.length - 1]?.length ?? 0];
}

function cursorOffset(value: string, position: [number, number]): number {
	const lines = value.split('\n');
	let offset = 0;
	for (let index = 0; index < position[0]; index += 1) {
		offset += (lines[index]?.length ?? 0) + 1;
	}

	return offset + position[1];
}

function positionAt(value: string, offset: number): [number, number] {
	const beforeCursor = value.slice(
		0,
		Math.max(0, Math.min(offset, value.length)),
	);
	return endPosition(beforeCursor);
}

function previousWordOffset(value: string, offset: number): number {
	const beforeCursor = value.slice(0, offset);
	return beforeCursor.search(/\S+\s*$/);
}

function nextWordOffset(value: string, offset: number): number {
	const match = /\s*\S+/.exec(value.slice(offset));
	return match ? offset + match.index + match[0].length : value.length;
}

type Message = {
	role: 'user' | 'assistant' | 'thinking' | 'console';
	content: string;
};

type Props = {
	version?: string;
	token: string;
	onInvalidToken: () => void;
	onExit: () => void;
};

export default function InteractiveChatView({
	version,
	token,
	onInvalidToken,
	onExit,
}: Props) {
	const [messages, setMessages] = useState<Message[]>([]);
	const [input, setInput] = useState('');
	const [cursorPosition, setCursorPosition] = useState<
		[line: number, column: number]
	>([0, 0]);
	const [loading, setLoading] = useState(false);
	const [mentionEntries, setMentionEntries] = useState<string[]>([]);
	const [filePickerOpen, setFilePickerOpen] = useState(false);
	const [commandPickerOpen, setCommandPickerOpen] = useState(false);
	const sessionId = useRef<string>();
	const initialization = useRef<Promise<void>>();
	const initializationSucceeded = useRef(false);
	const hasUserMessage = useRef(false);
	const unmounted = useRef(false);
	const sessionDeleted = useRef(false);
	const {pending, confirmTool} = useToolConfirmation();
	const fileQuery = mentionQuery(input) ?? '';
	const commandQuery = slashCommandQuery(input) ?? '';

	useInput(
		(_input, key) => {
			const lines = input.split('\n');
			const [line, column] = cursorPosition;
			const offset = cursorOffset(input, cursorPosition);

			if (key.home || (key.ctrl && key.upArrow)) {
				setCursorPosition(key.ctrl ? [0, 0] : [line, 0]);
				return;
			}

			if (key.end || (key.ctrl && key.downArrow)) {
				setCursorPosition(
					key.ctrl ? endPosition(input) : [line, lines[line]?.length ?? 0],
				);
				return;
			}

			if (key.leftArrow) {
				const nextOffset = key.ctrl
					? previousWordOffset(input, offset)
					: Math.max(0, offset - 1);
				setCursorPosition(positionAt(input, nextOffset));
				return;
			}

			if (key.rightArrow) {
				const nextOffset = key.ctrl
					? nextWordOffset(input, offset)
					: Math.min(input.length, offset + 1);
				setCursorPosition(positionAt(input, nextOffset));
				return;
			}

			if (key.upArrow && line > 0) {
				setCursorPosition([
					line - 1,
					Math.min(column, lines[line - 1]?.length ?? 0),
				]);
			}

			if (key.downArrow && line < lines.length - 1) {
				setCursorPosition([
					line + 1,
					Math.min(column, lines[line + 1]?.length ?? 0),
				]);
				return;
			}

			if (key.pageUp || key.pageDown) {
				const direction = key.pageUp ? -1 : 1;
				const targetLine = Math.max(
					0,
					Math.min(lines.length - 1, line + direction * 5),
				);
				setCursorPosition([
					targetLine,
					Math.min(column, lines[targetLine]?.length ?? 0),
				]);
			}
		},
		{isActive: !filePickerOpen && !commandPickerOpen && !loading && !pending},
	);

	const handleInputChange = useCallback((value: string) => {
		setInput(value);
		setFilePickerOpen(mentionQuery(value) !== undefined);
		setCommandPickerOpen(slashCommandQuery(value) !== undefined);
	}, []);

	const runCommand = useCallback(
		(command: SlashCommand) => {
			setCommandPickerOpen(false);
			command.execute({exit: onExit});
		},
		[onExit],
	);

	const updateCommandQuery = useCallback((query: string) => {
		setInput(`/${query}`);
	}, []);

	const selectFile = useCallback(
		(file: string) => {
			const nextInput = input.replace(/@[^\s@]*$/, `@${file} `);
			setInput(nextInput);
			setCursorPosition(endPosition(nextInput));
			setFilePickerOpen(false);
		},
		[input],
	);

	const updateFileQuery = useCallback((query: string) => {
		setInput(previous => previous.replace(/@[^\s@]*$/, `@${query}`));
	}, []);

	useEffect(() => {
		void (async () => {
			let files: string[];

			try {
				const {stdout} = await execFileAsync('git', [
					'ls-files',
					'--cached',
					'--others',
					'--exclude-standard',
				]);
				files = stdout.split('\n').filter(Boolean);
			} catch {
				files = await listWorkspaceFiles();
			}

			setMentionEntries(createMentionEntries(files));
		})();
	}, []);

	const appendAssistantResponse = useCallback(
		(response: {content?: string; thinkingContent?: string}) => {
			setMessages(previous => [
				...previous,
				...(response.thinkingContent?.trim()
					? [{role: 'thinking' as const, content: response.thinkingContent}]
					: []),
				{role: 'assistant' as const, content: response.content ?? 'Ai Error!'},
			]);
		},
		[],
	);

	const handleToolMessage = useCallback((content: string) => {
		setMessages(previous => [...previous, {role: 'console', content}]);
	}, []);

	const deleteUnusedSession = useCallback(() => {
		if (
			hasUserMessage.current ||
			sessionDeleted.current ||
			!sessionId.current
		) {
			return;
		}

		sessionDeleted.current = true;
		void deleteSession(token, sessionId.current).catch(() => undefined);
	}, [token]);

	useEffect(() => {
		initialization.current = (async () => {
			try {
				const response = await getAIResponse(token, CHAT_SYSTEM_PROMPT);
				sessionId.current = response.sessionId;
				initializationSucceeded.current = true;
				if (unmounted.current) {
					deleteUnusedSession();
					return;
				}
			} catch (error) {
				if (isInvalidTokenError(error)) {
					onInvalidToken();
					return;
				}
				if (!unmounted.current) {
					setMessages(previous => [
						...previous,
						{
							role: 'assistant',
							content: `Error: ${
								error instanceof Error ? error.message : String(error)
							}`,
						},
					]);
				}
			}
		})();

		return () => {
			unmounted.current = true;
			deleteUnusedSession();
		};
	}, [deleteUnusedSession, onInvalidToken, token]);

	const handleSubmit = useCallback(
		(value: string) => {
			if (!value.trim() || loading) return;
			const slashCommand = resolveSlashCommand(value);
			if (slashCommand) {
				runCommand(slashCommand);
				return;
			}
			hasUserMessage.current = true;

			const userMessage: Message = {
				role: 'user',
				content: value.trim(),
			};

			setMessages(prev => [...prev, userMessage]);
			setInput('');
			setCursorPosition([0, 0]);
			setLoading(true);

			void (async () => {
				try {
					await initialization.current;
					if (!initializationSucceeded.current) return;

					const fullResponse = await getAIResponse(
						token,
						userMessage.content,
						confirmTool,
						handleToolMessage,
					);

					appendAssistantResponse(fullResponse);
				} catch (err) {
					if (isInvalidTokenError(err)) {
						onInvalidToken();
						return;
					}
					setMessages(prev => [
						...prev,
						{
							role: 'assistant',
							content: `Error: ${
								err instanceof Error ? err.message : String(err)
							}`,
						},
					]);
				} finally {
					setLoading(false);
				}
			})();
		},
		[
			loading,
			token,
			confirmTool,
			handleToolMessage,
			appendAssistantResponse,
			onInvalidToken,
			runCommand,
		],
	);

	return (
		<Box flexDirection="column">
			<RpCliLogo version={version} />

			<Box flexDirection="column" marginX={1}>
				{messages.map((msg, i) => (
					<Box key={i} flexDirection="column" marginBottom={1}>
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
									✦{' '}
								</Text>

								<MarkdownText text={msg.content} />
							</Box>
						)}

						{msg.role === 'thinking' && (
							<Box flexDirection="column">
								<Text color="gray" bold>
									Thinking
								</Text>
								<MarkdownText text={msg.content} />
							</Box>
						)}

						{msg.role === 'console' && (
							<Box>
								<MarkdownText text={msg.content} />
							</Box>
						)}
					</Box>
				))}

				{pending ? (
					<ToolConfirmation details={pending.details} />
				) : loading ? (
					<Spinner text="Thinking..." />
				) : (
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
								}}
								onChange={handleInputChange}
								onCursorChange={position => setCursorPosition(position)}
								onSubmit={handleSubmit}
								placeholder="Type @ to mention a file or folder... (Shift+Enter | Alt+Enter | Ctrl+J for newline)"
								showInvisibles={{space: false, tab: true, newline: false}}
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
				)}
			</Box>
		</Box>
	);
}
