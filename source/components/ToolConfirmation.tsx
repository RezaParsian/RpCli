import React, {useCallback, useRef, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {
	describeToolConfirmation,
	type ToolCall,
	type ToolConfirmationDetails,
} from '../tools/index.js';

type PendingConfirmation = {
	details: ToolConfirmationDetails;
	resolve: (approved: boolean) => void;
};

export function useToolConfirmation() {
	const [pending, setPending] = useState<PendingConfirmation>();
	const pendingReference = useRef<PendingConfirmation>();

	const confirmTool = useCallback(async (call: ToolCall) => {
		const details = await describeToolConfirmation(call);
		return new Promise<boolean>(resolve => {
			const request = {details, resolve};
			pendingReference.current = request;
			setPending(request);
		});
	}, []);

	useInput(input => {
		const request = pendingReference.current;
		if (!request || (input !== 'y' && input !== 'n')) return;

		pendingReference.current = undefined;
		setPending(undefined);
		request.resolve(input === 'y');
	});

	return {pending, confirmTool};
}

function Diff({content}: {content: string}) {
	return (
		<Box flexDirection="column" marginTop={1}>
			{content.split('\n').map((line, index) => (
				<Text
					key={index}
					color={
						line.startsWith('+ ')
							? 'green'
							: line.startsWith('- ')
							? 'red'
							: undefined
					}
				>
					{line}
				</Text>
			))}
		</Box>
	);
}

export function ToolConfirmation({
	details,
}: {
	details: ToolConfirmationDetails;
}) {
	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor="yellow"
			paddingX={1}
		>
			<Text color="yellow" bold>
				{details.title}
			</Text>
			<Text>{details.description}</Text>
			{details.diff && <Diff content={details.diff} />}
			<Text>
				Proceed? <Text color="green">[y] yes</Text>{' '}
				<Text color="red">[n] no</Text>
			</Text>
		</Box>
	);
}
