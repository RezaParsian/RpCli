import React from 'react'
import { Box, Text } from 'ink'
import type { ChatMode } from '../../actions/agent.js'

type Props = {
	mode: ChatMode
	searchEnabled: boolean
	thinkingEnabled: boolean
	loggingEnabled: boolean
}

export default function ChatStatusBar({ mode, searchEnabled, thinkingEnabled, loggingEnabled }: Props) {
	return (
		<Box justifyContent="space-between" paddingX={1}>
			<Text dimColor>Ready</Text>

			<Box gap={2}>
				<Text>
					Mode: <Text color={mode === 'yolo' ? 'red' : mode === 'normal' ? 'yellow' : 'green'}>{mode}</Text>{' '}
					<Text dimColor>(TAB)</Text>
				</Text>

				<Text>
					Search:{' '}
					<Text color={searchEnabled ? 'green' : 'red'} bold>
						{searchEnabled ? 'ON' : 'OFF'}
					</Text>{' '}
					<Text dimColor>(/search)</Text>
				</Text>

				<Text>
					Thinking:{' '}
					<Text color={thinkingEnabled ? 'green' : 'red'} bold>
						{thinkingEnabled ? 'ON' : 'OFF'}
					</Text>{' '}
					<Text dimColor>(/thinking)</Text>
				</Text>

				<Text>
					Log:{' '}
					<Text color={loggingEnabled ? 'green' : 'red'} bold>
						{loggingEnabled ? 'ON' : 'OFF'}
					</Text>{' '}
					<Text dimColor>(/logging)</Text>
				</Text>
			</Box>
		</Box>
	)
}
