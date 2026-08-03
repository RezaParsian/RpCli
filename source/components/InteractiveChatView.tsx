import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Box, Text} from 'ink';
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
import FzfFilePicker from './FzfFilePicker.js';

const execFileAsync = promisify(execFile);

function mentionQuery(value: string): string | undefined {
	const match = /(?:^|\s)@([^\s@]*)$/.exec(value);
	return match?.[1];
}

type Message = {
	role: 'user' | 'assistant' | 'console';
	content: string;
};

type Props = {
	version?: string;
	token: string;
	onInvalidToken: () => void;
};

export default function InteractiveChatView({
	version,
	token,
	onInvalidToken,
}: Props) {
	const [messages, setMessages] = useState<Message[]>([]);
	const [input, setInput] = useState('');
	const [loading, setLoading] = useState(false);
	const [files, setFiles] = useState<string[]>([]);
	const [filePickerOpen, setFilePickerOpen] = useState(false);
	const sessionId = useRef<string>();
	const initialization = useRef<Promise<void>>();
	const initializationSucceeded = useRef(false);
	const hasUserMessage = useRef(false);
	const unmounted = useRef(false);
	const sessionDeleted = useRef(false);
	const {pending, confirmTool} = useToolConfirmation();
	const fileQuery = mentionQuery(input) ?? '';

	const handleInputChange = useCallback((value: string) => {
		setInput(value);
		setFilePickerOpen(mentionQuery(value) !== undefined);
	}, []);

	const selectFile = useCallback((file: string) => {
		setInput(previous => previous.replace(/@[^\s@]*$/, `@${file} `));
		setFilePickerOpen(false);
	}, []);

	const updateFileQuery = useCallback((query: string) => {
		setInput(previous => previous.replace(/@[^\s@]*$/, `@${query}`));
	}, []);

	useEffect(() => {
		void execFileAsync('git', [
			'ls-files',
			'--cached',
			'--others',
			'--exclude-standard',
		])
			.then(({stdout}) => {
				setFiles(stdout.split('\n').filter(Boolean));
			})
			.catch(() => setFiles([]));
	}, []);

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
			hasUserMessage.current = true;

			const userMessage: Message = {
				role: 'user',
				content: value.trim(),
			};

			setMessages(prev => [...prev, userMessage]);
			setInput('');
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

					setMessages(prev => [
						...prev,
						{
							role: 'assistant',
							content: fullResponse.content ?? 'Ai Error!',
						},
					]);
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
		[loading, token, confirmTool, handleToolMessage, onInvalidToken],
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
								focus={!filePickerOpen}
								value={input}
								onChange={handleInputChange}
								onSubmit={handleSubmit}
								placeholder="Type @ to mention a file... (Shift+Enter | Alt+Enter | Ctrl+J for newline)"
								showInvisibles={{space: false, tab: true, newline: false}}
							/>
						</Box>
						{filePickerOpen && (
							<FzfFilePicker
								files={files}
								query={fileQuery}
								onCancel={() => setFilePickerOpen(false)}
								onQueryChange={updateFileQuery}
								onSelect={selectFile}
							/>
						)}
					</Box>
				)}
			</Box>
		</Box>
	);
}
