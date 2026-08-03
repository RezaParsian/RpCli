import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {slashCommands, type SlashCommand} from '../commands/index.js';

type Props = {
	query: string;
	onCancel: () => void;
	onQueryChange: (query: string) => void;
	onSelect: (command: SlashCommand) => void;
};

export default function SlashCommandPicker({
	query,
	onCancel,
	onQueryChange,
	onSelect,
}: Props) {
	const matches = useMemo(() => {
		const normalizedQuery = query.toLowerCase();
		return slashCommands.filter(command =>
			[command.name, ...(command.aliases ?? [])].some(name =>
				name.slice(1).includes(normalizedQuery),
			),
		);
	}, [query]);
	const [selectedIndex, setSelectedIndex] = useState(0);

	useEffect(() => setSelectedIndex(0), [query]);

	useInput((input, key) => {
		if (key.escape) {
			onCancel();
			return;
		}

		if (key.upArrow || key.downArrow) {
			const direction = key.upArrow ? -1 : 1;
			setSelectedIndex(current =>
				matches.length === 0
					? 0
					: (current + direction + matches.length) % matches.length,
			);
			return;
		}

		if (key.return) {
			const command = matches[selectedIndex];
			if (command) onSelect(command);
			return;
		}

		if (key.backspace || key.delete) {
			onQueryChange(query.slice(0, -1));
			return;
		}

		if (input && !key.ctrl && !key.meta) onQueryChange(query + input);
	});

	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor="magenta"
			paddingX={1}
		>
			<Text color="magenta" bold>
				Commands matching /{query}
			</Text>
			{matches.length === 0 ? (
				<Text dimColor>No matching commands</Text>
			) : (
				matches.map((command, index) => (
					<Box key={command.name}>
						<Text color={index === selectedIndex ? 'magenta' : undefined}>
							{index === selectedIndex ? '› ' : '  '}
							{command.name}
							{command.aliases?.length
								? ` (${command.aliases.join(', ')})`
								: ''}
						</Text>
						<Text dimColor> — {command.description}</Text>
					</Box>
				))
			)}
			<Text dimColor>↑/↓ select · enter run · esc close</Text>
		</Box>
	);
}
