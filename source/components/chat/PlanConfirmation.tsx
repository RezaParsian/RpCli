import React from 'react'
import { Box, Text, useInput } from 'ink'

type Props = {
	onDecide: (start: boolean) => void
}

export default function PlanConfirmation({ onDecide }: Props) {
	useInput((input, key) => {
		if (key.escape || input === 'n' || input === 'N') onDecide(false)
		if (input === 'y' || input === 'Y') onDecide(true)
	})

	return (
		<Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1}>
			<Text color="green" bold>
				Start this plan?
			</Text>
			<Text>Approve to leave plan mode and apply the steps above.</Text>
			<Text>
				<Text color="green">[y] start</Text> <Text color="red">[n] stay in plan</Text>
			</Text>
		</Box>
	)
}
