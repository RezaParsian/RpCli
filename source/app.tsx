import React from 'react';
import {Box, Text} from 'ink';
import CommitView from './components/CommitView.js';
import SinglePromptView from './components/SinglePromptView.js';
import InteractiveChatView from './components/InteractiveChatView.js';

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
	if (mode === 'commit') {
		return (
			<Box flexDirection="column" marginX={1} marginY={1}>
				<Header />
				<CommitView useAll={commitAll} />
			</Box>
		);
	}

	if (mode === 'prompt') {
		return (
			<Box flexDirection="column" marginX={1} marginY={1}>
				<Header />
				<SinglePromptView prompt={prompt} />
			</Box>
		);
	}

	return <InteractiveChatView version={version} />;
}
