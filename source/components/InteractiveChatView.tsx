import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Box, Text} from 'ink';
import TextInput from 'ink-text-input';
import RpCliLogo from './RpCliLogo.js';
import Spinner from './Spinner.js';
import MarkdownText from './MarkdownText.js';
import {CHAT_SYSTEM_PROMPT, getAIResponse} from '../actions/chat.js';
import {ToolConfirmation, useToolConfirmation} from './ToolConfirmation.js';
import deleteSession from '../core/DeleteSession.js';

type Message = {
	role: 'user' | 'assistant';
	content: string;
};

type Props = {
	version?: string;
};

const token = process.env['DEEPSEEK_TOKEN'];

export default function InteractiveChatView({version}: Props) {
	const [messages, setMessages] = useState<Message[]>([]);
	const [input, setInput] = useState('');
	const [loading, setLoading] = useState(true);
	const [initialized, setInitialized] = useState(false);
	const sessionId = useRef<string>();
	const hasUserMessage = useRef(false);
	const unmounted = useRef(false);
	const sessionDeleted = useRef(false);
	const {pending, confirmTool} = useToolConfirmation();
	const handleToolMessage = useCallback((content: string) => {
		setMessages(previous => [...previous, {role: 'assistant', content}]);
	}, []);

	if (!token) throw new Error('No token provided');

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
	}, []);

	useEffect(() => {
		void (async () => {
			try {
				const response = await getAIResponse(token, CHAT_SYSTEM_PROMPT);
				sessionId.current = response.sessionId;
				if (unmounted.current) {
					deleteUnusedSession();
					return;
				}

				setInitialized(true);
			} catch (error) {
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
			} finally {
				if (!unmounted.current) setLoading(false);
			}
		})();

		return () => {
			unmounted.current = true;
			deleteUnusedSession();
		};
	}, [deleteUnusedSession]);

	const handleSubmit = useCallback(
		(value: string) => {
			if (!value.trim() || loading || !initialized) return;
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
		[messages, loading, initialized, confirmTool, handleToolMessage],
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
				) : !initialized ? (
					<Text color="red">Chat initialization failed.</Text>
				) : (
					<Box
						borderStyle="single"
						borderLeft={false}
						borderRight={false}
						borderColor="cyan"
					>
						<Text color="magenta" bold>
							{'> '}
						</Text>
						<TextInput
							value={input}
							onChange={setInput}
							onSubmit={handleSubmit}
							placeholder="Type your message..."
						/>
					</Box>
				)}
			</Box>
		</Box>
	);
}
