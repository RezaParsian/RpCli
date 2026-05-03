import React, {useEffect} from 'react';
import {Box, Text, useApp} from 'ink';
import type {Model} from './config/models.js';
import ModelsList from './components/ModelsList.js';
import CommitView from './components/CommitView.js';
import SinglePromptView from './components/SinglePromptView.js';
import InteractiveChatView from './components/InteractiveChatView.js';

type Mode = 'interactive' | 'prompt' | 'commit' | 'models';

type Props = {
	mode: Mode;
	selectedModel: Model;
	allModels: Model[];
	commitAll: boolean;
	prompt: string;
	version?: string;
};

function Header({model}: {model: Model}) {
	return (
		<Box flexDirection="column" marginBottom={1}>
			<Text bold color="cyan">
				🚀 RP-CLI AI Assistant
			</Text>
			<Text color="gray">
				{'Model: '}
				<Text color="white">{model.name}</Text>
				{'  '}
				<Text color="gray">({model.provider})</Text>
			</Text>
		</Box>
	);
}

export default function App({
	mode,
	selectedModel,
	allModels,
	commitAll,
	prompt,
	version,
}: Props) {
	const {exit} = useApp();

	useEffect(() => {
		if (mode !== 'models') return;

		const timer = setTimeout(() => exit(), 100);
		return () => clearTimeout(timer);
	}, [mode, exit]);

	if (mode === 'models') {
		return <ModelsList models={allModels} />;
	}

	if (mode === 'commit') {
		return (
			<Box flexDirection="column" marginX={1} marginY={1}>
				<Header model={selectedModel} />
				<CommitView modelId={selectedModel.id} useAll={commitAll} />
			</Box>
		);
	}

	if (mode === 'prompt') {
		return (
			<Box flexDirection="column" marginX={1} marginY={1}>
				<Header model={selectedModel} />
				<SinglePromptView modelId={selectedModel.id} prompt={prompt} />
			</Box>
		);
	}

	return <InteractiveChatView model={selectedModel} version={version} />;
}
