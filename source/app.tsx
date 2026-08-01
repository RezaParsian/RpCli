import React, {useCallback, useState} from 'react';
import {Box, Text} from 'ink';
import CommitView from './components/CommitView.js';
import SinglePromptView from './components/SinglePromptView.js';
import InteractiveChatView from './components/InteractiveChatView.js';
import TokenSetupView from './components/TokenSetupView.js';
import {clearDeepSeekToken} from './core/TokenConfig.js';

type Mode = 'interactive' | 'prompt' | 'commit';

type Props = {
	mode: Mode;
	commitAll: boolean;
	prompt: string;
	version?: string;
};

function Header() {
	return (
		<Box flexDirection="column" marginBottom={1}>
			<Text bold color="cyan">
				🚀 RP-CLI AI Assistant
			</Text>
		</Box>
	);
}

export default function App({mode, commitAll, prompt, version}: Props) {
	const [token, setToken] = useState(process.env['DEEPSEEK_TOKEN']);
	const handleInvalidToken = useCallback(() => {
		delete process.env['DEEPSEEK_TOKEN'];
		setToken(undefined);
		void clearDeepSeekToken();
	}, []);

	if (!token) {
		return (
			<Box flexDirection="column" marginX={1} marginY={1}>
				<Header />
				<TokenSetupView onTokenSaved={setToken} />
			</Box>
		);
	}

	if (mode === 'commit') {
		return (
			<Box flexDirection="column" marginX={1} marginY={1}>
				<Header />
				<CommitView
					useAll={commitAll}
					token={token}
					onInvalidToken={handleInvalidToken}
				/>
			</Box>
		);
	}

	if (mode === 'prompt') {
		return (
			<Box flexDirection="column" marginX={1} marginY={1}>
				<Header />
				<SinglePromptView
					prompt={prompt}
					token={token}
					onInvalidToken={handleInvalidToken}
				/>
			</Box>
		);
	}

	return (
		<InteractiveChatView
			version={version}
			token={token}
			onInvalidToken={handleInvalidToken}
		/>
	);
}
