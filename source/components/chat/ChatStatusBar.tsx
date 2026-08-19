import React from 'react'
import { Box, Text } from 'ink'
import type { ChatMode } from '../../actions/agent.js'

type Props = {
	mode: ChatMode
	searchEnabled: boolean
	thinkingEnabled: boolean
	modelType: 'default' | 'expert'
}

export default function ChatStatusBar({ mode, searchEnabled, thinkingEnabled, modelType }: Props) {
	return (
		<Box justifyContent="space-between" paddingX={1}>
			<Text dimColor>Ready</Text>

			<Box gap={2}>
				<Text>
					Mode:{' '}
					<Text color={mode === 'yolo' ? 'red' : mode === 'normal' ? 'yellow' : 'green'}>{mode}</Text>
					{mode === 'plan' ? <Text dimColor> read-only</Text> : null} <Text dimColor>(TAB)</Text>
				</Text>

				<Text>
					Model:{' '}
					<Text color={modelType === 'expert' ? 'magenta' : 'cyan'} bold>
						{modelType}
					</Text>{' '}
					<Text dimColor>(/model)</Text>
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


			</Box>
		</Box>
	)
}
