import React, {useCallback, useState} from 'react';
import {Box, Text} from 'ink';
import TextInput from 'ink-text-input';
import RpCliLogo from './RpCliLogo.js';
import Spinner from './Spinner.js';
import MarkdownText from './MarkdownText.js';
import {CHAT_SYSTEM_PROMPT, getAIResponse} from '../actions/chat.js';
import {ToolConfirmation, useToolConfirmation} from './ToolConfirmation.js';

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
	const [loading, setLoading] = useState(false);
	const {pending, confirmTool} = useToolConfirmation();
	const handleToolMessage = useCallback((content: string) => {
		setMessages(previous => [...previous, {role: 'assistant', content}]);
	}, []);

	if (!token) throw new Error('No token provided');

	const handleSubmit = useCallback(
		(value: string) => {
			if (!value.trim() || loading) return;

			const userMessage: Message = {
				role: 'user',
				content: value.trim(),
			};

			setMessages(prev => [...prev, userMessage]);
			setInput('');
			setLoading(true);

			void (async () => {
				try {
					await getAIResponse(token, CHAT_SYSTEM_PROMPT);

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
		[messages, loading, confirmTool, handleToolMessage],
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
