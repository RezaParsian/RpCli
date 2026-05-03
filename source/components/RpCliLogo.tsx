import os from 'os';
import React from 'react';
import {Box, Text, useWindowSize} from 'ink';
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';
import type {Model} from '../config/models.js';

type Props = {
	version?: string;
	model?: Model;
};

export default function RpCliLogo({version, model}: Props) {
	const {columns} = useWindowSize();
	const cwd = process.cwd().replace(os.homedir(), '~');

	return (
		<Box alignItems="center" marginY={1}>
			<Gradient name="teen">
				<BigText text="RpCli" />
			</Gradient>

			<Gradient name="teen">
				<Box
					borderStyle="round"
					borderColor="#999"
					marginLeft={3}
					width={Math.floor(columns / 3)}
					height={6}
					flexDirection="column"
					paddingX={1}
				>
					<Text>
						{'>'}_ rp-cli (<Text color="gray">{version ?? '0.0.0'}</Text>)
					</Text>
					{model && (
						<Text>
							<Text color="gray">model: </Text>
							<Text>{model.name}</Text>
						</Text>
					)}
					<Text>
						<Text color="gray">dir: </Text>
						<Text wrap="truncate-end">{cwd}</Text>
					</Text>
				</Box>
			</Gradient>
		</Box>
	);
}
