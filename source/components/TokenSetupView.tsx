import React, {useEffect} from 'react';
import {Box, Text} from 'ink';
import openDeepSeek, {
	DEEPSEEK_TOKEN_COMMAND,
	DEEPSEEK_URL,
} from '../core/OpenDeepSeek.js';

export default function TokenSetupView() {
	useEffect(() => {
		openDeepSeek();
	}, []);

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
			<Text>3. Send us the returned value so we can configure RP-CLI.</Text>
		</Box>
	);
}
