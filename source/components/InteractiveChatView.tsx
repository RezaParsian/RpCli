import React, {useCallback, useState} from 'react';
import {Box, Text} from 'ink';
import TextInput from 'ink-text-input';
import type {ChatCompletionMessageParam} from 'openai/resources/chat/completions';
import type {Model} from '../config/models.js';
import RpCliLogo from './RpCliLogo.js';
import Spinner from './Spinner.js';
import MarkdownText from './MarkdownText.js';
import {CHAT_SYSTEM_PROMPT, getAIResponse} from '../actions/chat.js';

type Message = {
	role: 'user' | 'assistant';
	content: string;
};

type Props = {
	model: Model;
	version?: string;
};

export default function InteractiveChatView({model, version}: Props) {
	const [messages, setMessages] = useState<Message[]>([]);
	const [input, setInput] = useState('');
	const [loading, setLoading] = useState(false);
	const [streamingContent, setStreamingContent] = useState('');

	const handleSubmit = useCallback(
		(value: string) => {
			if (!value.trim() || loading) return;

			const userMessage: Message = {role: 'user', content: value.trim()};
			setMessages(prev => [...prev, userMessage]);
			setInput('');
			setLoading(true);
			setStreamingContent('');

			const apiMessages: ChatCompletionMessageParam[] = [
				{role: 'system', content: CHAT_SYSTEM_PROMPT},
				{role: 'assistant', content: 'Got it. Thanks for the context!'},
				...messages.map(
					m =>
						({role: m.role, content: m.content}) as ChatCompletionMessageParam,
				),
				{role: 'user', content: userMessage.content},
			];

			void (async () => {
				try {
					const fullResponse = await getAIResponse(
						model.id,
						apiMessages,
						chunk => {
							setStreamingContent(prev => prev + chunk);
						},
					);
					setStreamingContent('');
					setMessages(prev => [
						...prev,
						{role: 'assistant', content: fullResponse},
					]);
				} catch (err) {
					setStreamingContent('');
					setMessages(prev => [
						...prev,
						{
							role: 'assistant',
							content: `Error: ${err instanceof Error ? err.message : String(err)}`,
						},
					]);
				} finally {
					setLoading(false);
				}
			})();
		},
		[messages, model.id, loading],
	);

	return (
		<Box flexDirection="column">
			<RpCliLogo version={version} model={model}/>

			<Box flexDirection="column" marginX={1}>
				{messages.map((msg, i) => (
					<Box key={i} flexDirection="column" marginBottom={1}>
						{msg.role === 'user' ? (
							<Box>
								<Text color="magenta" bold>
									{'> '}{msg.content}
								</Text>
							</Box>
						) : (
							<Box>
								<Text color="magenta" bold>✦ </Text>
								<MarkdownText text={msg.content}/>
							</Box>
						)}
					</Box>
				))}

				{loading ? (
					streamingContent ? (
						<Box>
							<Text color="magenta" bold>{'✦ '}</Text>
							<MarkdownText text={streamingContent}/>
						</Box>
					) : (
						<Spinner text="Thinking..." />
					)
				) : (
					<Box borderStyle="single" borderLeft={false} borderRight={false} borderColor="cyan">
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
