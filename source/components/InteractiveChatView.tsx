import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Box, Text} from 'ink';
import type {Key} from 'ink';
import RpCliLogo from './RpCliLogo.js';
import Spinner from './Spinner.js';
import MarkdownText from './MarkdownText.js';
import {CHAT_SYSTEM_PROMPT, getAIResponse} from '../actions/chat.js';
import {ToolConfirmation, useToolConfirmation} from './ToolConfirmation.js';
import deleteSession from '../core/DeleteSession.js';
import {isInvalidTokenError} from '../core/InvalidTokenError.js';
import {MultilineInput} from 'ink-multiline-input';

type Message = {
	role: 'user' | 'assistant';
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
	const sessionId = useRef<string>();
	const initialization = useRef<Promise<void>>();
	const initializationSucceeded = useRef(false);
	const hasUserMessage = useRef(false);
	const unmounted = useRef(false);
	const sessionDeleted = useRef(false);
	const {pending, confirmTool} = useToolConfirmation();
	const handleToolMessage = useCallback((content: string) => {
		setMessages(previous => [...previous, {role: 'assistant', content}]);
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
						{msg.role === 'user' ? (
							<Box>
								<Text color="magenta" bold>
									{'> '}
									{msg.content}
								</Text>
							</Box>
						) : (
							<Box>
								<Text color="magenta" bold>
									✦{' '}
								</Text>
								<MarkdownText text={msg.content} />
							</Box>
						)}
					</Box>
				))}

				{pending ? (
					<ToolConfirmation call={pending.call} />
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

							{input === '' && (
								<Text dimColor>
									Type your message... (Enter to submit, Alt+Enter for a new
									line)
								</Text>
							)}

							<MultilineInput
								value={input}
								onChange={setInput}
								onSubmit={handleSubmit}
								rows={3}
								textStyle={{color: 'white'}}
								keyBindings={{
									submit: (key: Key) => key.return && !key.meta,
									newline: (key: Key) => key.return && key.meta,
								}}
							/>
						</Box>
					</Box>
				)}
			</Box>
		</Box>
	);
}
