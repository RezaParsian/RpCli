import React from 'react';
import {Box, Text} from 'ink';
import type {Model} from '../config/models.js';

type Props = {
	models: Model[];
};

export default function ModelsList({ models }: Props) {
	return (
		<Box flexDirection="column" marginY={1}>
			<Text bold color="cyan">🤖 Available Models ({models.length})</Text>
			<Box marginBottom={1} />

			{models.map((model, index) => (
				<Box key={model.id} flexDirection="column" marginBottom={1}>
					<Box>
						<Text color="gray">{(index + 1).toString().padStart(2, '0')}. </Text>

						<Text bold>{model.name}</Text>

						{model.is_default && (
							<Text color="green"> ★ Default</Text>
						)}
					</Box>

					<Box marginLeft={4}>
						<Text color="gray">Provider: </Text>
						<Text color="white">{model.provider}</Text>
					</Box>

					<Box marginLeft={4}>
						<Text color="gray">Model Code: </Text>
						<Text color="yellow">{model.model_code}</Text>
					</Box>
				</Box>
			))}
		</Box>
	);
}
