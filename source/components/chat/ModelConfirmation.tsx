import React from 'react'
import { Box, Text, useInput } from 'ink'

type Props = {
	newModel: 'default' | 'expert'
	onConfirm: () => void
	onCancel: () => void
}

export default function ModelConfirmation({ newModel, onConfirm, onCancel }: Props) {
	useInput((_input, key) => {
		if (key.return) {
			onConfirm()
		} else if (key.escape) {
			onCancel()
		}
	})

	return (
		<Box flexDirection="column" borderStyle="single" borderColor="yellow" padding={1}>
			<Text color="yellow" bold>
				⚠️ Switch to {newModel} model?
			</Text>
			<Text>This will start a new chat session. Current conversation will be lost.</Text>
			<Box marginTop={1}>
				<Text>
					Press <Text color="green">Enter</Text> to confirm or <Text color="red">Esc</Text> to cancel.
				</Text>
			</Box>
		</Box>
	)
}
