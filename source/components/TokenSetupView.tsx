import React, {useEffect, useState} from 'react';
import {Box, Text} from 'ink';
import TextInput from 'ink-text-input';
import openDeepSeek, {
	DEEPSEEK_TOKEN_COMMAND,
	DEEPSEEK_URL,
} from '../core/OpenDeepSeek.js';
import {saveDeepSeekToken} from '../core/TokenConfig.js';

type Props = {
	onTokenSaved: (token: string) => void;
};

export default function TokenSetupView({onTokenSaved}: Props) {
	const [token, setToken] = useState('');
	const [status, setStatus] = useState<'input' | 'saving' | 'saved' | 'error'>(
		'input',
	);
	const [error, setError] = useState('');

	useEffect(() => {
		openDeepSeek();
	}, []);

	const handleSubmit = (value: string) => {
		const normalizedToken = value.trim();
		if (!normalizedToken || status !== 'input') return;

		setStatus('saving');
		void saveDeepSeekToken(normalizedToken)
			.then(() => {
				process.env['DEEPSEEK_TOKEN'] = normalizedToken;
				setToken('');
				setStatus('saved');
				onTokenSaved(normalizedToken);
			})
			.catch((error: unknown) => {
				setError(error instanceof Error ? error.message : String(error));
				setStatus('error');
			});
	};

	return (
		<Box flexDirection="column">
			<Text color="yellow" bold>
				DeepSeek token is not configured.
			</Text>
			<Text>
				1. Sign in to DeepSeek in the browser that was opened: {DEEPSEEK_URL}
			</Text>
			<Text>2. Open the browser developer console and run:</Text>
			<Box borderStyle="single" paddingX={1} marginY={1}>
				<Text color="cyan">{DEEPSEEK_TOKEN_COMMAND}</Text>
			</Box>
			<Text>3. Paste the returned value below and press Enter:</Text>
			{status === 'input' ? (
				<Box>
					<Text color="magenta" bold>
						{'Token: '}
					</Text>
					<TextInput
						value={token}
						onChange={setToken}
						onSubmit={handleSubmit}
						mask="*"
						placeholder="Paste your token here"
					/>
				</Box>
			) : status === 'saving' ? (
				<Text color="yellow">Saving token...</Text>
			) : status === 'saved' ? (
				<Text color="green" bold>
					✓ Token saved. Run RP-CLI again to continue.
				</Text>
			) : (
				<Text color="red">✖ Could not save token: {error}</Text>
			)}
		</Box>
	);
}
