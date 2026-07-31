import React, {useCallback, useRef, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import type {ToolCall} from '../tools/index.js';

type PendingConfirmation = {
	call: ToolCall;
	resolve: (approved: boolean) => void;
};

export function useToolConfirmation() {
	const [pending, setPending] = useState<PendingConfirmation>();
	const pendingReference = useRef<PendingConfirmation>();

	const confirmTool = useCallback((call: ToolCall) => {
		return new Promise<boolean>(resolve => {
			const request = {call, resolve};
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

export function ToolConfirmation({call}: {call: ToolCall}) {
	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor="yellow"
			paddingX={1}
		>
			<Text color="yellow" bold>
				Tool confirmation required
			</Text>
			<Text>
				{call.name}: {JSON.stringify(call.arguments)}
			</Text>
			<Text>Allow this action? [y/n]</Text>
		</Box>
	);
}
