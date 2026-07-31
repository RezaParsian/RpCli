import React, {useEffect, useState} from 'react';
import {Text, useApp} from 'ink';
import Spinner from './Spinner.js';
import MarkdownText from './MarkdownText.js';
import {CHAT_SYSTEM_PROMPT, getAIResponse} from '../actions/chat.js';
import deleteSession from '../core/DeleteSession.js';
import {ToolConfirmation, useToolConfirmation} from './ToolConfirmation.js';

type State = 'loading' | 'done' | 'error';

type Props = {
	prompt: string;
};

const token = process.env['DEEPSEEK_TOKEN'];

export default function SinglePromptView({prompt}: Props) {
	const {exit} = useApp();
	const [state, setState] = useState<State>('loading');
	const [response, setResponse] = useState('');
	const [error, setError] = useState('');
	const {pending, confirmTool} = useToolConfirmation();

	if (!token) throw new Error('No token provided');

	useEffect(() => {
		void (async () => {
			try {
				await getAIResponse(token, CHAT_SYSTEM_PROMPT);

				const fullResponse = await getAIResponse(token, prompt, confirmTool);

				deleteSession(token, fullResponse.sessionId);

				setResponse(fullResponse.content ?? 'Ai Error!');
				setState('done');
			} catch (err) {
				console.log({err});
				setError(err instanceof Error ? err.message : String(err));
				setState('error');
			}
		})();
	}, [prompt, confirmTool]);

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

	if (pending) return <ToolConfirmation call={pending.call} />;

	if (!response) {
		return <Spinner text="Thinking..." />;
	}

	return <MarkdownText text={response} />;
}
