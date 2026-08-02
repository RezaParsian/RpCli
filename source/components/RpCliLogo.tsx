import os from 'os';
import React from 'react';
import {Box, Text, useWindowSize} from 'ink';
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';

type Props = {
	version?: string;
};

export default function RpCliLogo({version}: Props) {
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
					height={5}
					flexDirection="column"
					paddingX={1}
				>
					<Text>
						{'>'}_ rc (<Text color="gray">{version ?? '0.0.0'}</Text>)
					</Text>

					<Text>
						<Text color="gray">dir: </Text>
						<Text wrap="truncate-end">{cwd}</Text>
					</Text>
				</Box>
			</Gradient>
		</Box>
	);
}
