import React, {useCallback, useEffect, useState} from 'react';
import {Box, Text, useApp} from 'ink';
import Spinner from './Spinner.js';
import MarkdownText from './MarkdownText.js';
import {CHAT_SYSTEM_PROMPT, getAIResponse} from '../actions/chat.js';
import deleteSession from '../core/DeleteSession.js';
import {ToolConfirmation, useToolConfirmation} from './ToolConfirmation.js';

type State = 'loading' | 'done' | 'error';

type Props = {
	prompt: string;
};

const token = process.env['DEEPSEEK_TOKEN']!;

export default function SinglePromptView({prompt}: Props) {
	const {exit} = useApp();
	const [state, setState] = useState<State>('loading');
	const [response, setResponse] = useState('');
	const [error, setError] = useState('');
	const [toolMessages, setToolMessages] = useState<string[]>([]);
	const {pending, confirmTool} = useToolConfirmation();
	const handleToolMessage = useCallback((content: string) => {
		setToolMessages(previous => [...previous, content]);
	}, []);

	useEffect(() => {
		void (async () => {
			try {
				await getAIResponse(token, CHAT_SYSTEM_PROMPT);

				const fullResponse = await getAIResponse(
					token,
					prompt,
					confirmTool,
					handleToolMessage,
				);

				deleteSession(token, fullResponse.sessionId);

				setResponse(fullResponse.content ?? 'Ai Error!');
				setState('done');
			} catch (err) {
				console.log({err});
				setError(err instanceof Error ? err.message : String(err));
				setState('error');
			}
		})();
	}, [prompt, confirmTool, handleToolMessage]);

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
			{toolMessages.map((message, index) => (
				<Box key={index} marginBottom={1}>
					<MarkdownText text={message} />
				</Box>
			))}
			{pending ? (
				<ToolConfirmation call={pending.call} />
			) : response ? (
				<MarkdownText text={response} />
			) : (
				<Spinner text="Thinking..." />
			)}
		</Box>
	);
}
