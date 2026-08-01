import React from 'react';
import {Box, Text} from 'ink';
import CommitView from './components/CommitView.js';
import SinglePromptView from './components/SinglePromptView.js';
import InteractiveChatView from './components/InteractiveChatView.js';
import TokenSetupView from './components/TokenSetupView.js';

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
	const token = process.env['DEEPSEEK_TOKEN'];

	if (!token) {
		return (
			<Box flexDirection="column" marginX={1} marginY={1}>
				<Header />
				<TokenSetupView />
			</Box>
		);
	}

	if (mode === 'commit') {
		return (
			<Box flexDirection="column" marginX={1} marginY={1}>
				<Header />
				<CommitView useAll={commitAll} token={token} />
			</Box>
		);
	}

	if (mode === 'prompt') {
		return (
			<Box flexDirection="column" marginX={1} marginY={1}>
				<Header />
				<SinglePromptView prompt={prompt} token={token} />
			</Box>
		);
	}

	return <InteractiveChatView version={version} token={token} />;
}
