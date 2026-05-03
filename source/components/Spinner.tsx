import React from 'react';
import {Box, Text} from 'ink';
import InkSpinner from 'ink-spinner';

type Props = {
	text: string;
};

export default function Spinner({text}: Props) {
	return (
		<Box>
			<InkSpinner type="dots" />
			<Text> {text}</Text>
		</Box>
	);
}
