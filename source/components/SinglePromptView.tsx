import React, {useEffect, useState} from 'react';
import {Text, useApp} from 'ink';
import type {ChatCompletionMessageParam} from 'openai/resources/chat/completions';
import Spinner from './Spinner.js';
import MarkdownText from './MarkdownText.js';
import {CHAT_SYSTEM_PROMPT, getAIResponse} from '../actions/chat.js';

type State = 'loading' | 'done' | 'error';

type Props = {
	modelId: string;
	prompt: string;
};

export default function SinglePromptView({modelId, prompt}: Props) {
	const {exit} = useApp();
	const [state, setState] = useState<State>('loading');
	const [response, setResponse] = useState('');
	const [error, setError] = useState('');

	useEffect(() => {
		const messages: ChatCompletionMessageParam[] = [
			{role: 'system', content: CHAT_SYSTEM_PROMPT},
			{role: 'assistant', content: 'Got it. Thanks for the context!'},
			{role: 'user', content: prompt},
		];

		void (async () => {
			try {
				await getAIResponse(modelId, messages, chunk => {
					setResponse(prev => prev + chunk);
				});
				setState('done');
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
				setState('error');
			}
		})();
	}, [modelId, prompt]);

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

	if (!response) {
		return <Spinner text="Thinking..." />;
	}

	return <MarkdownText text={response} />;
}
