import React, {useCallback, useEffect, useState} from 'react';
import {Box, Text, useApp} from 'ink';
import Spinner from './Spinner.js';
import MarkdownText from './MarkdownText.js';
import {CHAT_SYSTEM_PROMPT, getAIResponse} from '../actions/chat.js';
import deleteSession from '../core/DeleteSession.js';
import {ToolConfirmation, useToolConfirmation} from './ToolConfirmation.js';
import {isInvalidTokenError} from '../core/InvalidTokenError.js';

type State = 'loading' | 'done' | 'error';

type Props = {
	prompt: string;
	thinking: boolean;
	quiet: boolean;
	token: string;
	onInvalidToken: () => void;
};

export default function SinglePromptView({
	prompt,
	thinking,
	quiet,
	token,
	onInvalidToken,
}: Props) {
	const {exit} = useApp();
	const [state, setState] = useState<State>('loading');
	const [response, setResponse] = useState('');
	const [thinkingResponse, setThinkingResponse] = useState('');
	const [error, setError] = useState('');
	const [toolMessages, setToolMessages] = useState<string[]>([]);
	const {pending, confirmTool} = useToolConfirmation();
	const handleToolMessage = useCallback((content: string) => {
		setToolMessages(previous => [...previous, content]);
	}, []);

	useEffect(() => {
		void (async () => {
			try {
				await getAIResponse(
					token,
					CHAT_SYSTEM_PROMPT,
					undefined,
					undefined,
					thinking,
				);

				const fullResponse = await getAIResponse(
					token,
					prompt,
					confirmTool,
					handleToolMessage,
					thinking,
				);

				deleteSession(token, fullResponse.sessionId);

				setResponse(fullResponse.content ?? 'Ai Error!');
				setThinkingResponse(fullResponse.thinkingContent ?? '');
				setState('done');
			} catch (err) {
				if (isInvalidTokenError(err)) {
					onInvalidToken();
					return;
				}
				console.log({err});
				setError(err instanceof Error ? err.message : String(err));
				setState('error');
			}
		})();
	}, [prompt, thinking, token, confirmTool, handleToolMessage, onInvalidToken]);

	useEffect(() => {
		if (state !== 'done' && state !== 'error') return;
		const timer = setTimeout(() => exit(), 100);
		return () => clearTimeout(timer);
	}, [state, exit]);

	if (state === 'error') {
		return (
			<Text color="red" bold>
				✖ Error: {error}
			</Text>
		);
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
	);
}
