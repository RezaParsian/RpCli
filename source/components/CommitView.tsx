import React, {useEffect, useState} from 'react';
import {Box, Text, useApp, useInput} from 'ink';
import Spinner from './Spinner.js';
import {executeCommit, generateCommitMessage, getGitDiff,} from '../actions/commitMessage.js';

type State =
	| 'init'
	| 'generating'
	| 'review'
	| 'committing'
	| 'success'
	| 'cancelled'
	| 'no-diff'
	| 'error';

type Props = {
	modelId: string;
	useAll: boolean;
};

export default function CommitView({modelId, useAll}: Props) {
	const {exit} = useApp();
	const [state, setState] = useState<State>('init');
	const [commitMessage, setCommitMessage] = useState('');
	const [error, setError] = useState('');

	useEffect(() => {
		let diff: string;
		try {
			diff = getGitDiff(useAll);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setState('error');
			return;
		}

		if (!diff || diff.trim() === '') {
			setState('no-diff');
			return;
		}

		setState('generating');

		void (async () => {
			try {
				const message = await generateCommitMessage(modelId, diff);
				setCommitMessage(message);
				setState('review');
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
				setState('error');
			}
		})();
	}, [modelId, useAll]);

	useEffect(() => {
		if (state !== 'committing') return;

		try {
			executeCommit(commitMessage);
			setState('success');
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setState('error');
		}
	}, [state, commitMessage]);

	useEffect(() => {
		if (
			state !== 'success' &&
			state !== 'error' &&
			state !== 'no-diff' &&
			state !== 'cancelled'
		)
			return;

		const delay =
			state === 'success' ? 1000 : state === 'cancelled' ? 0 : 2000;
		const timer = setTimeout(() => exit(), delay);
		return () => clearTimeout(timer);
	}, [state, exit]);

	useInput(
		input => {
			if (input === 'y' || input === 'Y') {
				setState('committing');
			} else if (input === 'n' || input === 'N') {
				setState('cancelled');
			}
		},
		{isActive: state === 'review'},
	);

	if (state === 'init' || state === 'generating') {
		return <Spinner text="Generating commit message..."/>;
	}

	if (state === 'review') {
		return (
			<Box flexDirection="column">
				<Text bold color="magenta">
					📝 Suggested Commit Message:
				</Text>
				<Box borderStyle="single" marginY={1} paddingX={1}>
					<Text color="cyan">{commitMessage}</Text>
				</Box>
				<Text>
					Do you want to commit with this message?{' '}
					<Text color="yellow">(y/n)</Text>
				</Text>
			</Box>
		);
	}

	if (state === 'committing') {
		return <Spinner text="Committing changes..."/>;
	}

	if (state === 'success') {
		return (
			<Text color="green" bold>
				✓ Successfully committed!
			</Text>
		);
	}

	if (state === 'cancelled') {
		return <Text color="yellow">Commit cancelled.</Text>;
	}

	if (state === 'no-diff') {
		return (
			<Box flexDirection="column">
				<Text color="red" bold>
					{'Error: No changes found in git diff '}
					{useAll ? 'HEAD' : '--staged'}.
				</Text>
				{!useAll && (
					<Text color="yellow">
						{'Tip: Stage your changes first using `git add .` or `git add <file>`'}
					</Text>
				)}
			</Box>
		);
	}

	return (
		<Text color="red" bold>
			✖ Error: {error}
		</Text>
	);
}
