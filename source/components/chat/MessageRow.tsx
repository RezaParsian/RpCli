import React from 'react'
import {Box, Text} from 'ink'
import MarkdownText from '../MarkdownText.js'
import RpCliLogo from '../RpCliLogo.js'
import type {ChatMessage} from './types.js'

export const MessageRow = React.memo(function MessageRow({
	msg,
	version,
}: {
	msg: ChatMessage
	version?: string
}) {
	return (
		<Box flexDirection="column" marginBottom={1}>
			{msg.role === 'logo' && <RpCliLogo version={version} />}

			{msg.role === 'user' && (
				<Box>
					<Text color="magenta" bold>
						{'> '}
						{msg.content}
					</Text>
				</Box>
			)}

			{msg.role === 'assistant' && (
				<Box>
					<Text color="magenta" bold>
						{'✦ '}
					</Text>

					<MarkdownText text={msg.content} />
				</Box>
			)}

			{msg.role === 'thinking' && (
				<Box>
					<Text color="gray" dimColor>
						{'◈ '}
					</Text>

					<Text color="gray" dimColor italic>
						{msg.content}
					</Text>
				</Box>
			)}

			{msg.role === 'console' && (
				<Box>
					<MarkdownText dim text={msg.content} />
				</Box>
			)}
		</Box>
	)
})
