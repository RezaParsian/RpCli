import React from 'react'
import { Box, Text } from 'ink'

export default function UpdateNotice({ message }: { message?: string }) {
	if (!message) return null

	return (
		<Box flexShrink={0} paddingX={1}>
			<Text color="yellow">{message.trim()}</Text>
		</Box>
	)
}
